# Add Coverage Thresholds and CI Enforcement

*Date: 2026-01-24 2215*

## Why

Phase 1 established baseline coverage (23.63%). Phase 2 adds enforcement to prevent coverage regressions. Without thresholds, coverage could silently decrease as new code is added.

## How

- Enabled global coverage thresholds in `vitest.coverage.config.ts`
- Added `pnpm test:coverage` step to CI workflow
- Set thresholds below baseline to allow minor fluctuation

## Key Design Decisions

- **20% threshold (not 23.63%)**: Provides ~3% buffer for minor coverage fluctuations without blocking PRs
- **15% branch threshold**: Branches naturally have lower coverage due to error paths
- **CI enforcement, not pre-push**: Keeps local development fast while ensuring coverage on all PRs
- **Global thresholds only**: Per-file thresholds would be too restrictive for packages with 0% coverage (web, relay CLI)

## Thresholds

| Metric | Threshold | Current |
|--------|-----------|---------|
| Statements | 20% | 23.61% |
| Branches | 15% | 85.94% |
| Functions | 20% | 65.15% |
| Lines | 20% | 23.61% |

## What's Next

- Phase 3: Incrementally increase thresholds as coverage improves
- Add tests to Lambda handlers, relay CLI, and web components
