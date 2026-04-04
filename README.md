# get-all-npm-contributions

Sync all your npm package contributions and daily download statistics for a given npm username.

## Installation

```bash
npm install get-all-npm-contributions
```

## Usage

### As a library

```typescript
import { GetAllNpmContributions } from "get-all-npm-contributions";
import type { ImportConfig, ImportData } from "get-all-npm-contributions";

const config: ImportConfig = {
  username: "your-npm-username",
  import: {
    concurrency: 10,
    maxRetries: 2,
  },
};

// Optionally pass existing data to do an incremental sync
const data: ImportData = {
  username: "your-npm-username",
  packages: {},
  importState: { importProgress: { progressStats: { initial: { packageCount: 0, versionCount: 0, downloadDayCount: 0, totalDownloads: 0 }, total: { packageCount: 0, versionCount: 0, downloadDayCount: 0, totalDownloads: 0 }, current: { packageCount: 0, versionCount: 0, downloadDayCount: 0, totalDownloads: 0 }, new: { packageCount: 0, versionCount: 0, downloadDayCount: 0, totalDownloads: 0 } }, status: "pending" } },
};

const sync = new GetAllNpmContributions({ config, data });
await sync.sync();

// `data` is mutated in place and now contains all contributions
console.log(sync.data.packages);
```

### As a CLI script

1. Copy `config.example.json` to `config.json` and add your npm username
2. Run the import:

```bash
npm run import
```

Data is saved to `data/data.json` and persisted every 30 seconds during the sync.

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `username` | `string` | required | npm username to track packages for |
| `import.concurrency` | `number` | `10` | Maximum concurrent API requests |
| `import.maxRetries` | `number` | `2` | Retry attempts for failed requests |
| `import.pageSize` | `number` | `250` | Number of items per page for search pagination |

## Data Structure

The synced `ImportData` contains:

- **packages** - Per-package data including metadata, versions, and daily download counts
- **importState** - Sync progress and timestamps for incremental syncs

Each package includes:

```typescript
interface Package {
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
  versions: Record<string, number>;   // version string -> publish timestamp
  downloads: Record<string, number>;  // date string (YYYY-MM-DD) -> download count
}
```

## How It Works

1. Searches for all packages authored by the configured username via the npm registry search API
2. Fetches detailed package metadata (versions, timestamps) from the npm registry
3. Fetches daily download statistics using the npm downloads range API
4. Skips days that already have download data (delta sync)
5. Only fetches downloads for fully completed days (excludes the current day)
6. Tracks all dates from package creation to yesterday

All API calls include automatic rate limit handling with exponential backoff on HTTP 429 responses.

## License

MIT
