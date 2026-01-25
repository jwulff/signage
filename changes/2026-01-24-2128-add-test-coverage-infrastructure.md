# Add Test Coverage Infrastructure

*Date: 2026-01-24 2128*

## Why

The codebase has 190 tests but no visibility into what code is actually covered. Without coverage metrics, there's no way to identify untested code paths or prevent coverage regressions. This is Phase 1 of a multi-phase coverage rollout.

## How

- Added `@vitest/coverage-v8` to measure coverage using V8's native instrumentation
- Created root `vitest.coverage.config.ts` with workspace alias resolution and coverage configuration
- Added `pnpm test:coverage` script to generate coverage reports
- Configured HTML reports locally, JSON/lcov in CI for future integration

## Key Design Decisions

- **V8 provider over Istanbul**: Uses V8's native instrumentation for significantly faster coverage collection with comparable accuracy
- **Root-level config with aliases**: Resolves workspace packages (`@signage/core`, `@signage/functions`) for monorepo-wide coverage
- **No thresholds in Phase 1**: Measure baseline first, set thresholds in Phase 2 based on actual coverage
- **Pre-push hook unchanged**: Keep local development fast; enforce coverage in CI (Phase 2)

## Baseline Coverage

| Package | Statements | Key Insight |
|---------|------------|-------------|
| Overall | 23.63% | Low due to many untested Lambda handlers |
| core | 67.85% | Pixoo protocol well tested |
| functions/rendering | 84.86% | Rendering logic has good coverage |
| functions/dexcom | 100% | API client fully tested |
| relay | 17.5% | CLI and relay untested |
| web | 0% | No tests yet |

## What's Next

- **Phase 2**: Set global threshold at ~20% (baseline minus buffer), add CI enforcement
- **Phase 3**: Incrementally increase thresholds as coverage improves
- Consider adding tests to Lambda handlers and relay CLI
