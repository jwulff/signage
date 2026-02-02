# Fix Glooko scraper user ID mismatch

*Date: 2026-02-01 2100*

## Why
After the schema consolidation in PR #188, the Glooko scraper was storing daily insulin records under user ID "primary", but all query code (treatments.ts, compositor.ts, etc.) was looking for user ID "john". This caused daily insulin totals for recent days to be missing from the display because the queries couldn't find the data stored by the scraper.

## How
Changed `DEFAULT_USER_ID` in `scraper.ts` from `"primary"` to `"john"` to match the user ID used throughout the rest of the codebase.

## Key Design Decisions
- Simple one-line fix to align the scraper with existing convention
- All other files (18+) already use "john" as the user ID
- Next scraper run will store data with correct user ID, making it visible to queries

## What's Next
- Deploy to production so the next Glooko scrape stores data under the correct user ID
- After the next scrape, daily insulin totals should display correctly for recent days
