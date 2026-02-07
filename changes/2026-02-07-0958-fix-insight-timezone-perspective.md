# Fix Insight Timezone Perspective

*Date: 2026-02-07 0958*

## Why

The AI insight agent was saying things like "evening going well" at noon Pacific time. The agent's understanding of time-of-day was based on UTC hours from Lambda (us-east-1), not local Pacific time. Noon PST = 20:00 UTC, so the agent thought it was 8 PM.

## How

1. Added `getHourInTimezone()` helper that returns local hours using `Intl.DateTimeFormat` instead of `Date.getHours()` (which returns UTC on Lambda)
2. Added `getCurrentLocalTime()` helper that formats the current time as a human-readable local string
3. Fixed the hourly breakdown in `getDailyAggregation` to use local hours
4. Fixed weekly aggregation to use timezone-aware day boundaries
5. Fixed all default date parameters across glucose, treatment, and analysis tools to use `formatDateInTimezone()` instead of `toISOString().split("T")[0]` (which gives UTC date)
6. Added current local time to the stream-trigger prompt so the agent knows what time it actually is

## Key Design Decisions

- Reused the existing `DATA_TIMEZONE` ("America/Los_Angeles") constant and `Intl.DateTimeFormat` pattern already established in `formatDateInTimezone`
- Injected local time directly into the prompt rather than relying on the agent to infer it from data
- Fixed all five places where UTC dates leaked through (hourly breakdown, weekly boundaries, and three default-date fallbacks)

## What's Next

- The feat/deeper-analysis branch has a more detailed prompt that should also get this fix applied
- Consider adding the local time context to daily and weekly analysis prompts too
