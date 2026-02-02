# Event-Driven Analysis Triggers

*Date: 2026-02-01 2108*

## Why

The hourly cron-based analysis has limitations:
- **Stale insights**: Data arrives but analysis waits up to 59 minutes
- **Wasted compute**: Analysis runs even when no new data exists
- **Timing misses**: Data written just after cron runs waits the longest

For diabetes management, real-time insights matter. When CGM readings or treatment data arrives, the analysis should run immediately.

## How

Replaced the hourly EventBridge cron with DynamoDB Streams event-driven triggers:

1. **Enabled DynamoDB Streams** (`stream: "new-image"`) on SignageTable
2. **Created stream-trigger.ts** - new Lambda handler that:
   - Filters for INSERT events on CGM, BOLUS, BASAL, CARBS records
   - Applies freshness filter (15 min) to skip Glooko's historical backfills
   - Applies debounce (60s) to prevent rapid-fire analyses
   - Invokes Bedrock Agent with same prompt as hourly handler
3. **Updated analysis-pipeline.ts** - removed HourlyAnalysisCron, added stream subscription with `parallelizationFactor: 1` for serial processing
4. **Deleted hourly.ts** - functionality now in stream-trigger.ts

## Key Design Decisions

- **Freshness filter (15 min)**: Glooko imports 14 days of historical data - we don't want to analyze old records, only fresh data that matters for the current display
- **Debounce (60s)**: When Glooko sends 285 records at once, we run analysis once, not 285 times
- **Serial processing**: `parallelizationFactor: 1` ensures batch writes don't overwhelm Bedrock Agent
- **Keep daily/weekly crons**: Fixed schedules make sense for comprehensive summaries
- **UPPERCASE types**: Key format uses uppercase (from keys.ts `toUpperCase()`)

## What's Next

- Monitor costs to validate the ~$87/month estimate
- Consider adding `triggeredBy` field to insights for observability
- Potentially adjust freshness/debounce thresholds based on real-world usage
