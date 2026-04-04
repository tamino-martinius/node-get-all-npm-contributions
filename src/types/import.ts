export interface ImportConfig {
  username: string;
  import?: {
    concurrency?: number;
    maxRetries?: number;
    pageSize?: number;
  };
}

export interface Package {
  name: string;
  description: string;
  latestVersion: string;
  license: string;
  keywords: string[];
  publisher: { username: string; email: string };
  maintainers: { username: string; email: string }[];
  links: {
    npm?: string;
    homepage?: string;
    repository?: string;
    bugs?: string;
  };
  createdTimestamp: number;
  updatedTimestamp: number;
  versions: Record<string, number>;
  downloads: Record<string, number>;
}

export interface ProgressStats {
  packageCount: number;
  versionCount: number;
  downloadDayCount: number;
  totalDownloads: number;
}

export interface ImportProgress {
  progressStats: {
    initial: ProgressStats;
    total: ProgressStats;
    current: ProgressStats;
    new: ProgressStats;
  };
  status: "pending" | "in-progress" | "completed" | "error";
}

export interface ImportData {
  username: string;
  packages: Record<string, Package>;
  importState: {
    lastFullImportTimestamp?: number;
    importProgress: ImportProgress;
  };
}
