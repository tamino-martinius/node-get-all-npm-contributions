import * as https from "node:https";
import type {
  DownloadRangeResponse,
  PackageDetailsResponse,
  SearchResponse,
  SearchResultObject,
} from "./types/api.js";
import { Logger } from "./util/Logger.js";

interface NpmApiOptions {
  pageSize?: number;
  onApiCall?: (info: { url: string }) => void;
}

interface FetchResult {
  statusCode: number;
  data: string;
}

export class NpmApi {
  readonly #pageSize: number;
  readonly #onApiCall?: (info: { url: string }) => void;
  #requestDelay = 100;
  #throttleQueue: Promise<void> = Promise.resolve();

  constructor(options: NpmApiOptions = {}) {
    this.#pageSize = options.pageSize ?? 250;
    this.#onApiCall = options.onApiCall;
  }

  #throttle(): Promise<void> {
    this.#throttleQueue = this.#throttleQueue.then(
      () => new Promise((resolve) => setTimeout(resolve, this.#requestDelay)),
    );
    return this.#throttleQueue;
  }

  #rawFetch(url: string): Promise<FetchResult> {
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            resolve({ statusCode: res.statusCode ?? 0, data });
          });
        })
        .on("error", reject);
    });
  }

  async #fetch(url: string): Promise<string> {
    this.#onApiCall?.({ url });
    Logger.debug(`Fetching: ${url}`);

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < 5; attempt++) {
      await this.#throttle();
      const result = await this.#rawFetch(url);

      if (result.statusCode >= 200 && result.statusCode < 300) {
        return result.data;
      }

      if (result.statusCode === 429) {
        const delay = Math.min(2000 * 2 ** attempt, 60_000);
        this.#requestDelay = Math.min(this.#requestDelay * 2, 2000);
        Logger.debug(
          `Rate limited, waiting ${delay}ms (throttle now ${this.#requestDelay}ms)`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        lastError = new Error(
          `HTTP 429 for ${url}: ${result.data.substring(0, 200)}`,
        );
        continue;
      }

      throw new Error(
        `HTTP ${result.statusCode} for ${url}: ${result.data.substring(0, 200)}`,
      );
    }

    throw lastError ?? new Error(`Failed to fetch ${url}`);
  }

  async #fetchJson<T>(url: string): Promise<T> {
    const data = await this.#fetch(url);
    return JSON.parse(data) as T;
  }

  async searchPackagesByAuthor(
    username: string,
  ): Promise<SearchResultObject[]> {
    const allObjects: SearchResultObject[] = [];
    let from = 0;

    while (true) {
      const url = `https://registry.npmjs.org/-/v1/search?text=author:${encodeURIComponent(username)}&size=${this.#pageSize}&from=${from}`;
      const response = await this.#fetchJson<SearchResponse>(url);

      allObjects.push(...response.objects);

      if (
        allObjects.length >= response.total ||
        response.objects.length === 0
      ) {
        break;
      }

      from += response.objects.length;
    }

    return allObjects;
  }

  async getPackageDetails(
    packageName: string,
  ): Promise<PackageDetailsResponse> {
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    return this.#fetchJson<PackageDetailsResponse>(url);
  }

  async getDownloadRange(
    packageName: string,
    startDate: string,
    endDate: string,
  ): Promise<DownloadRangeResponse> {
    const url = `https://api.npmjs.org/downloads/range/${startDate}:${endDate}/${encodeURIComponent(packageName)}`;
    return this.#fetchJson<DownloadRangeResponse>(url);
  }
}
