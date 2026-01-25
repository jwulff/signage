# Fix Glooko Timestamp Parsing Timezone Bug

*Date: 2026-01-25 0748*

## Why
Glooko exports timestamps in the user's local timezone (America/Los_Angeles), but the CSV parser was interpreting them as UTC. This caused an 8-hour offset in PST, making:
- The latency indicator show ~10h instead of ~2h
- Daily insulin totals get bucketed into wrong days

## How
Fixed the timestamp parsing in both CSV parsers to interpret naive datetime strings in the user's timezone:
1. Added `parseLocalDateTime()` function that correctly converts local time to UTC
2. Uses Intl.DateTimeFormat to handle DST transitions properly
3. Added `correctTreatmentTimestamps()` shim at display time to fix already-stored data

## Key Design Decisions
- **Parse in target timezone**: Use Intl.DateTimeFormat to calculate the correct UTC offset for any given local datetime, handling DST automatically
- **Correction at display time**: Since data is already stored with wrong timestamps, we apply a correction when reading treatment data for display
- **Same fix in both parsers**: Updated both csv-parser.ts and scraper.ts to use the same timezone-aware parsing

## What's Next
- After the next Glooko scrape, newly stored data will have correct timestamps
- The display-time correction handles old data until it ages out
