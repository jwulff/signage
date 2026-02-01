# Dual-write Dexcom readings for agent analysis

*Date: 2026-01-31 2115*

## Why

The Bedrock diabetes agent was showing stale insights (e.g., "PERFECT 4HRS! 100% TIR" when current glucose was 207 mg/dL) because it analyzes CGM data from Glooko imports which can be hours old. Meanwhile, real-time Dexcom data was being fetched every minute for the display but only stored in the widget history format, not in the agent-compatible CGM format.

## How

Modified the blood sugar widget updater to dual-write Dexcom readings:

1. When fetching current readings for display, also store them as CGM records for the agent
2. When backfilling history, also store those readings for agent analysis
3. Uses fire-and-forget pattern to not block the display update if the dual-write fails

Key implementation details:
- Reuses existing `storeRecords()` from `@diabetes/core` which handles deduplication
- Converts Dexcom readings to `CgmReading` format with `sourceFile: "dexcom-share-api"`
- Errors are logged but don't fail the widget update (display is higher priority)

## Key Design Decisions

- **Fire-and-forget pattern**: The dual-write is done with `void storeCgmReadingsForAgent()` so it doesn't block the display update. Display responsiveness is more important than guaranteed agent data write.

- **Graceful degradation**: If the dual-write fails, we log the error but still return display data. The widget works even if the agent data store is unavailable.

- **Deduplication via existing storage**: Uses `storeRecords()` which already handles idempotent writes with conditional puts, so duplicate readings are safely ignored.

## What's Next

- Agent will now have real-time CGM data (within 1 minute of Dexcom)
- Insights should reflect current glucose status instead of stale Glooko data
- Consider deprecating Glooko CGM import since Dexcom provides real-time data
