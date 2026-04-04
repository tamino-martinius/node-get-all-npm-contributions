export interface SearchResultPackage {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  date: string;
  license?: string;
  publisher?: {
    username: string;
    email: string;
  };
  maintainers?: {
    username: string;
    email: string;
  }[];
  links?: {
    npm?: string;
    homepage?: string;
    repository?: string;
    bugs?: string;
  };
}

export interface SearchResultObject {
  package: SearchResultPackage;
  score: {
    final: number;
    detail: {
      quality: number;
      popularity: number;
      maintenance: number;
    };
  };
  downloads: {
    monthly: number;
    weekly: number;
  };
  dependents: number | string;
  searchScore: number;
}

export interface SearchResponse {
  objects: SearchResultObject[];
  total: number;
  time: string;
}

export interface PackageDetailsResponse {
  _id: string;
  _rev: string;
  name: string;
  description?: string;
  "dist-tags": Record<string, string>;
  versions: Record<
    string,
    {
      name: string;
      version: string;
      description?: string;
      license?: string;
      keywords?: string[];
      homepage?: string;
      repository?: { type: string; url: string };
      bugs?: { url: string };
      maintainers?: { name: string; email: string }[];
      dist: {
        integrity?: string;
        shasum?: string;
        tarball?: string;
        fileCount?: number;
        unpackedSize?: number;
      };
    }
  >;
  time: Record<string, string>;
  maintainers?: { name: string; email: string }[];
  license?: string;
  homepage?: string;
  keywords?: string[];
  repository?: { type: string; url: string };
  bugs?: { url: string };
  readme?: string;
}

export interface DownloadRangeDay {
  downloads: number;
  day: string;
}

export interface DownloadRangeResponse {
  start: string;
  end: string;
  package: string;
  downloads: DownloadRangeDay[];
}
