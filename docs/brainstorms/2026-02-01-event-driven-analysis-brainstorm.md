# Event-Driven Analysis Triggers

**Date:** 2026-02-01
**Status:** Ready for planning

## What We're Building

Replace the hourly cron-based analysis with event-driven triggers that run analysis immediately when new diabetes data arrives from Glooko or Dexcom.

### Goals
- **Fresher insights** - Analysis runs as soon as data arrives, not on a fixed schedule
- **Save compute costs** - No wasted runs when no new data exists
- **Better data accuracy** - Insights always reflect the latest available data
- **Simpler architecture** - Data flow naturally triggers analysis

## Why DynamoDB Streams

Evaluated three approaches:

| Approach | Complexity | Control | Chosen |
|----------|------------|---------|--------|
| DynamoDB Streams | Low | Automatic | **Yes** |
| EventBridge Events | Medium | Explicit | No |
| SNS Fan-out | Medium | Pub/sub | No |

**DynamoDB Streams wins because:**
- Native to existing infrastructure (no new services)
- Automatic triggering on record writes
- Built-in batching and retry
- No code changes to scraper or compositor

## Key Decisions

### 1. Trigger on both Dexcom and Glooko
- CGM readings arrive every ~5 minutes
- Glooko batches arrive 1-4x daily
- Analysis runs on either data source update

### 2. No rate limiting (cost accepted)
- ~290 analysis runs/day (vs 24 with hourly cron)
- Estimated cost: ~$87/month (vs ~$7/month)
- Freshness is prioritized over cost savings
- Every new data event triggers analysis

### 3. Keep daily/weekly crons
- Hourly analysis becomes event-driven
- Daily summary stays at 6 AM Pacific (fixed time makes sense for daily review)
- Weekly summary stays at Sunday 8 AM Pacific

### 4. Stream filtering
- Only trigger on diabetes record types (cgm, bolus, basal, carbs, etc.)
- Ignore insight writes (would cause infinite loop)
- Ignore metadata/connection records

## Implementation Notes

### DynamoDB Stream Setup
```typescript
// In infra/storage.ts - enable streams
const table = new sst.aws.Dynamo("Table", {
  // ... existing config
  stream: "new-image", // or "new-and-old-images" if we need to detect changes
});
```

### Stream Consumer Lambda
```typescript
// New handler: packages/functions/src/diabetes/analysis/stream-trigger.ts
// - Receives DynamoDB Stream events
// - Filters for relevant record types
// - Invokes existing analysis logic
```

### Filter Pattern
- PK starts with `USR#` and contains record types: `CGM`, `BOLUS`, `BASAL`, `CARBS`, etc.
- Exclude: `INSIGHT`, `CONNECTION`, `IMPORT_META`

## Open Questions

1. **Deduplication** - If multiple CGM readings arrive in the same batch, should we run analysis once or per-record? (Likely once per batch)

2. **Concurrency** - What if analysis is still running when new data arrives? (DynamoDB Streams handles this with shard-based ordering)

3. **Cold starts** - Should we keep analysis Lambda warm? (Probably not needed for 5-min frequency)

## What Changes

| Component | Before | After |
|-----------|--------|-------|
| `HourlyAnalysisCron` | EventBridge rate(1 hour) | **Remove** |
| Analysis trigger | Scheduled | DynamoDB Stream |
| `DailyAnalysisCron` | EventBridge cron | No change |
| `WeeklyAnalysisCron` | EventBridge cron | No change |
| Scraper | Writes to DynamoDB | No change (stream picks up writes) |
| Compositor | Writes CGM to DynamoDB | No change (stream picks up writes) |

## Next Steps

Run `/workflows:plan` to create implementation plan.
