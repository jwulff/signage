# Fix: Insulin Daily Totals Query Limit

*Date: 2026-01-29 2250*

## Why

The display was showing incorrect insulin totals for days older than 2-3 days. Investigation revealed that Glooko exports running totals throughout each day (potentially 4-8 records per day), but the query was limited to 20 records.

With `Limit: 20` and ~4+ records per day, only the most recent ~5 days of data was being fetched. Older days (5 days ago) would fall back to bolus-only values instead of the full daily totals.

## How

Increased the DynamoDB query limit from 20 to 100 in `fetchDailyInsulinTotals()`. This ensures at least 14 days of data is retrieved even with multiple running total records per day.

## Key Design Decisions

- **Limit: 100** provides comfortable margin for 14-day exports with 7+ records/day
- Keep existing "max value per date" logic to handle running totals correctly
- No pagination needed since 100 records is well under DynamoDB's 1MB limit

## What's Next

- Monitor Lambda logs to verify daily totals now include all expected dates
- Consider adding pagination if export window increases significantly
