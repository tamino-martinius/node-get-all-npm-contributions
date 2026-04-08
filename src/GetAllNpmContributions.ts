import { NpmApi } from "./NpmApi.js";
import type {
  PackageDetailsResponse,
  SearchResultObject,
} from "./types/api.js";
import type {
  ImportConfig,
  ImportData,
  ImportProgress,
  Package,
  ProgressStats,
} from "./types/import.js";
import { Logger } from "./util/Logger.js";
import { runParallel } from "./util/runParallel.js";

const MAX_RANGE_DAYS = 365;

function emptyProgressStats(): ProgressStats {
  return {
    packageCount: 0,
    versionCount: 0,
    downloadDayCount: 0,
    totalDownloads: 0,
  };
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getYesterdayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export class GetAllNpmContributions {
  readonly #config: ImportConfig;
  readonly #data: ImportData;
  readonly #api: NpmApi;

  constructor(props: { config: ImportConfig; data?: ImportData }) {
    this.#config = props.config;
    this.#data = props.data ?? {
      username: props.config.username,
      packages: {},
      importState: {
        importProgress: {
          progressStats: {
            initial: emptyProgressStats(),
            total: emptyProgressStats(),
            current: emptyProgressStats(),
            new: emptyProgressStats(),
          },
          status: "pending",
        },
      },
    };
    this.#data.username = props.config.username;

    this.#api = new NpmApi({
      pageSize: this.#config.import?.pageSize,
      onApiCall: () => {
        this.#printProgressDot();
      },
    });
  }

  #printProgressDot() {
    if (["log", "debug"].includes(Logger.logLevel)) {
      return;
    }
    process.stdout.write(".");
  }

  #clearProgressDot() {
    if (["log", "debug"].includes(Logger.logLevel)) {
      return;
    }
    process.stdout.write("\n");
  }

  get data(): ImportData {
    return this.#data;
  }

  #getProgress(): ImportProgress {
    return this.#data.importState.importProgress;
  }

  #initializeProgress(): void {
    const progress = this.#getProgress();
    const packages = Object.values(this.#data.packages);

    progress.progressStats.initial = {
      packageCount: packages.length,
      versionCount: packages.reduce(
        (sum, pkg) => sum + Object.keys(pkg.versions).length,
        0,
      ),
      downloadDayCount: packages.reduce(
        (sum, pkg) => sum + Object.keys(pkg.downloads).length,
        0,
      ),
      totalDownloads: packages.reduce(
        (sum, pkg) =>
          sum + Object.values(pkg.downloads).reduce((s, d) => s + d, 0),
        0,
      ),
    };

    progress.progressStats.total = { ...progress.progressStats.initial };
    progress.progressStats.current = emptyProgressStats();
    progress.progressStats.new = emptyProgressStats();
    progress.status = "in-progress";
  }

  async sync(): Promise<void> {
    const startTime = Date.now();
    this.#initializeProgress();
    const progress = this.#getProgress();

    console.log("Syncing npm contributions");
    console.log("Initial progress stats:", progress.progressStats.initial);

    try {
      const concurrency = this.#config.import?.concurrency ?? 10;
      const maxRetries = this.#config.import?.maxRetries ?? 2;

      // Step 1: Search all packages by author
      console.log(`Searching packages for user: ${this.#config.username}`);
      const searchResults = await this.#api.searchPackagesByAuthor(
        this.#config.username,
      );
      this.#clearProgressDot();
      Logger.log(`Found ${searchResults.length} packages`);

      // Step 2: Fetch details for each package
      console.log(`Syncing package details (${searchResults.length} packages)`);
      await runParallel({
        items: searchResults,
        callback: async (result: SearchResultObject) => {
          await this.#syncPackage(result);
        },
        maxConcurrency: concurrency,
        maxRetries,
      });
      this.#clearProgressDot();

      // Step 3: Fetch download stats using range API
      const downloadTasks = this.#buildDownloadRangeTasks();
      console.log(
        `Syncing download statistics (${downloadTasks.length} date ranges)`,
      );

      await runParallel({
        items: downloadTasks,
        callback: async (task) => {
          await this.#syncDownloadRange(
            task.packageName,
            task.startDate,
            task.endDate,
          );
        },
        maxConcurrency: Math.min(concurrency, 3),
        maxRetries,
      });
      this.#clearProgressDot();

      progress.status = "completed";
      this.#data.importState.lastFullImportTimestamp = Date.now();

      const duration = Date.now() - startTime;
      console.log(
        `Syncing completed in ${(duration / 1000 / 60).toFixed(2)} minutes`,
        progress.progressStats.new,
      );
    } catch (error) {
      progress.status = "error";
      throw error;
    }
  }

  async #syncPackage(searchResult: SearchResultObject): Promise<void> {
    const packageName = searchResult.package.name;
    const progress = this.#getProgress();
    const isNew = !(packageName in this.#data.packages);

    Logger.debug(`Syncing package: ${packageName}`);

    let details: PackageDetailsResponse;
    try {
      details = await this.#api.getPackageDetails(packageName);
    } catch (error) {
      Logger.error(`Failed to fetch details for ${packageName}:`, error);
      throw error;
    }

    const existingPkg = this.#data.packages[packageName];
    const versions: Record<string, number> = existingPkg?.versions ?? {};
    let newVersionCount = 0;

    for (const [version, dateStr] of Object.entries(details.time)) {
      if (version === "created" || version === "modified") continue;
      if (!(version in versions)) {
        versions[version] = new Date(dateStr).getTime();
        newVersionCount++;
      }
    }

    const pkg: Package = {
      name: packageName,
      description: searchResult.package.description ?? "",
      latestVersion: searchResult.package.version,
      license: searchResult.package.license ?? "",
      keywords: searchResult.package.keywords ?? [],
      publisher: searchResult.package.publisher ?? { username: "", email: "" },
      maintainers: searchResult.package.maintainers ?? [],
      links: searchResult.package.links ?? {},
      createdTimestamp: new Date(details.time.created ?? 0).getTime(),
      updatedTimestamp: new Date(details.time.modified ?? 0).getTime(),
      versions,
      downloads: existingPkg?.downloads ?? {},
    };

    this.#data.packages[packageName] = pkg;

    progress.progressStats.current.packageCount++;
    progress.progressStats.total.packageCount = Object.keys(
      this.#data.packages,
    ).length;
    progress.progressStats.current.versionCount += Object.keys(versions).length;
    progress.progressStats.total.versionCount += newVersionCount;

    if (isNew) {
      progress.progressStats.new.packageCount++;
      progress.progressStats.new.versionCount += Object.keys(versions).length;
    } else {
      progress.progressStats.new.versionCount += newVersionCount;
    }
  }

  #buildDownloadRangeTasks(): {
    packageName: string;
    startDate: string;
    endDate: string;
  }[] {
    const tasks: { packageName: string; startDate: string; endDate: string }[] =
      [];
    const yesterday = formatDate(getYesterdayUtc());

    for (const pkg of Object.values(this.#data.packages)) {
      if (!pkg.createdTimestamp) continue;

      const creationDate = formatDate(new Date(pkg.createdTimestamp));
      const missingRanges = this.#findMissingDateRanges(
        pkg,
        creationDate,
        yesterday,
      );

      for (const range of missingRanges) {
        // Split ranges larger than MAX_RANGE_DAYS into chunks
        let chunkStart = range.start;
        while (chunkStart <= range.end) {
          const chunkEnd = minDate(
            addDays(chunkStart, MAX_RANGE_DAYS - 1),
            range.end,
          );
          tasks.push({
            packageName: pkg.name,
            startDate: chunkStart,
            endDate: chunkEnd,
          });
          chunkStart = addDays(chunkEnd, 1);
        }
      }
    }

    return tasks;
  }

  #findMissingDateRanges(
    pkg: Package,
    startDate: string,
    endDate: string,
  ): { start: string; end: string }[] {
    const ranges: { start: string; end: string }[] = [];
    let rangeStart: string | null = null;

    const current = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);

    // Re-check the last 7 days as npm stats are gathered with some delay
    const reCheckThreshold = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    while (current <= end) {
      const dateStr = formatDate(current);
      const hasDta = dateStr in pkg.downloads && current < reCheckThreshold;

      if (!hasDta && rangeStart === null) {
        rangeStart = dateStr;
      } else if (hasDta && rangeStart !== null) {
        ranges.push({
          start: rangeStart,
          end: formatDate(new Date(current.getTime() - 24 * 60 * 60 * 1000)),
        });
        rangeStart = null;
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    if (rangeStart !== null) {
      ranges.push({ start: rangeStart, end: endDate });
    }

    return ranges;
  }

  async #syncDownloadRange(
    packageName: string,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    const progress = this.#getProgress();
    const pkg = this.#data.packages[packageName];

    if (!pkg) return;

    Logger.debug(`Fetching downloads: ${packageName} ${startDate}..${endDate}`);

    try {
      const result = await this.#api.getDownloadRange(
        packageName,
        startDate,
        endDate,
      );

      for (const entry of result.downloads) {
        pkg.downloads[entry.day] = entry.downloads;

        progress.progressStats.current.downloadDayCount++;
        progress.progressStats.current.totalDownloads += entry.downloads;
        progress.progressStats.total.downloadDayCount++;
        progress.progressStats.total.totalDownloads += entry.downloads;
        progress.progressStats.new.downloadDayCount++;
        progress.progressStats.new.totalDownloads += entry.downloads;
      }
    } catch (error) {
      Logger.error(
        `Failed to fetch downloads for ${packageName} ${startDate}..${endDate}:`,
        error,
      );
      throw error;
    }
  }
}
