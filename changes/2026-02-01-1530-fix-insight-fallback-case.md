# Fix Insight Fallback Overwriting Good Insights

*Date: 2026-02-01 1530*

## Why

The LED display was showing "4-HOUR GLUCOSE ANALYSIS" instead of actual AI insights like "Hi 4h avg234 248↑ chk?". Investigation revealed a case-sensitivity bug in the fallback detection logic.

The agent was correctly storing insights via the `storeInsight` tool, but the fallback logic in `hourly.ts` was checking for `response.includes("stored")` (lowercase). The agent responds with "**Stored**" (capitalized), so the fallback incorrectly triggered and extracted text from the response, overwriting the good insight.

## How

Changed the fallback detection from case-sensitive to case-insensitive in all three analysis files:

- `hourly.ts` - Fixed check for "stored" and "insight"
- `daily.ts` - Fixed check for "stored"
- `weekly.ts` - Fixed check for "stored"

```typescript
// Before (bug)
if (!response.includes("stored"))

// After (fix)
if (!response.toLowerCase().includes("stored"))
```

## Key Design Decisions

- **Case-insensitive check**: The agent's response format may vary (Stored, STORED, stored), so normalizing to lowercase handles all cases
- **Added tests**: New test cases verify the fallback detection works correctly regardless of capitalization

## What's Next

- The next hourly analysis run will store proper insights
- Monitor that insights display correctly
