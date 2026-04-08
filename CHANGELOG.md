# Changelog

## 0.1.1

- Re-check download stats from the last 7 days during delta sync to account for delayed npm statistics

## 0.1.0

- Initial release
- Sync npm package contributions and daily download statistics for a given username
- Fetch all packages via npm registry search API
- Fetch detailed package metadata (versions, timestamps) from npm registry
- Fetch daily download statistics via npm downloads range API
- Incremental sync support (skips days that already have download data)
- Rate limit handling with automatic exponential backoff
- Concurrent API requests with configurable concurrency and retries
- Periodic data persistence during sync
