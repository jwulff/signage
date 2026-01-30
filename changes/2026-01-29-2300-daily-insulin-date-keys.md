# Fix: Use Date-Based Keys for Daily Insulin Records

*Date: 2026-01-29 2300*

## Why

The previous data model for daily insulin records used timestamp-based sort keys. This caused problems because Glooko exports running totals throughout each day (4-8 records per day), and each snapshot had a unique key. Queries using `Limit: N` couldn't guarantee coverage of specific dates - older days might be truncated or missing entirely.

This resulted in insulin totals showing incorrect values for days 3-5 days ago (falling back to bolus-only calculations, roughly half the actual total).

## How

Changed the data model for `daily_insulin` records to use the date string (YYYY-MM-DD) as the sort key instead of timestamp+hash. This ensures:

1. **Exactly one record per date** - Multiple running total imports overwrite with higher values
2. **Deterministic queries** - Can query for exact date ranges without guessing limits
3. **Simpler code** - No need for "max value per date" deduplication in the reader

### Changes

**storage.ts**:
- `generateRecordKeys()` now uses date as sk for daily_insulin records
- Added conditional upsert logic that only writes if new value is higher
- Added `queryDailyInsulinByDateRange()` method for clean date-range queries

**compositor.ts**:
- Simplified `fetchDailyInsulinTotals()` to use date-range query
- Removed deduplication logic (no longer needed)

## Key Design Decisions

- **Conditional upsert**: Only overwrites if new totalInsulinUnits > existing. This handles the case where imports might arrive out of order while ensuring we always keep the highest (most complete) daily total.

- **7-day query window**: Fetches today + 6 previous days to ensure display's 5-day view is covered even with timezone edge cases.

- **No migration needed**: Old timestamp-based records will age out naturally. New date-based records take over immediately since the scraper runs hourly.

## What's Next

- Monitor logs to verify daily totals are now consistent
- Consider similar pattern for other running-total data if needed
