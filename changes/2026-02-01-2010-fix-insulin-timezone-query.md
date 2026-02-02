# Fix insulin daily totals timezone mismatch

*Date: 2026-02-01 2010*

## Why
Daily insulin totals for yesterday and today showed incorrect values (bolus-only instead of basal+bolus). The query for DAILY_INSULIN records used UTC dates, but the data is stored with Pacific timezone dates, causing recent days to not be found.

## How
Changed `fetchDailyInsulinTotals()` to use Pacific timezone dates via `formatDateInTimezone()` from @diabetes/core instead of `toISOString().slice(0, 10)` which returns UTC dates.

## Key Design Decisions
- Reuse existing `formatDateInTimezone()` and `DATA_TIMEZONE` from @diabetes/core for consistency
- Query dates now match how data is stored (Pacific timezone)

## What's Next
- Monitor that daily insulin totals display correctly after deploy
