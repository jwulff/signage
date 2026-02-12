# Address unaddressed review feedback from PRs #228-235

*Date: 2026-02-11 2220*

## Why

Multiple PRs (#228-235) were merged with unaddressed Copilot and CodeX review
comments. These flagged real issues: a hardcoded ARN partition, a race condition
in reasoning updates, missing type safety, inconsistent data between CURRENT and
HISTORY records, no tests for reasoning extraction, and a batch ordering bug.

## How

- **Hardcoded ARN partition** (PR #235): Changed `arn:aws:` to use
  `currentPartition` interpolation, matching every other ARN in the file.
- **Batch glucose extraction** (PR #232): Pick the record with the latest
  timestamp instead of blindly taking the last one in the array.
- **InsightZone type safety** (PR #232): Exported `InsightZone` from models
  and used it for `zoneAtGeneration` instead of bare `string`.
- **HISTORY record consistency** (PR #232): Write `glucoseAtGeneration` and
  `zoneAtGeneration` to both CURRENT and HISTORY records in parallel.
- **Race condition in updateCurrentInsightReasoning** (PR #232): Accept
  `generatedAt` as a parameter instead of fetching it, eliminating the window
  where a concurrent write could cause updates to the wrong history record.
- **extractReasoningFromResponse tests** (PR #232): Added 11 tests covering
  bold/plain headers, truncation, markdown stripping, missing reasoning, and
  section boundary detection.

## Key Design Decisions

- Passed `generatedAt` as a parameter rather than adding a conditional check,
  because the caller always has the timestamp available and this is simpler.
- Used `Promise.all` for the CURRENT + HISTORY glucose/zone updates since
  they're independent writes to different keys.

## What's Next

- The relay package's `@signage/core` resolution issue is pre-existing and
  unrelated (requires `pnpm --filter @signage/core build` before tests).
