# Oura Widget Enhancements

*Date: 2026-01-21 2302*

## Why

The initial Oura widget showed only readiness scores. Sleep scores are equally important for understanding recovery. Also, the single 6 AM fetch often missed data because Oura syncs morning data later.

## How

Sleep score integration:
1. Added OuraSleep types and API response handling
2. Implemented fetchSleep, cacheSleep, getCachedSleep in client
3. Updated fetch Lambda to get both readiness and sleep data
4. Changed display format to "J 75/82" (sleep/readiness)
5. Added color coding for sleep scores (same thresholds as readiness)

Retry logic for data availability:
1. Changed from single 8 AM fetch to hourly 7 AM - 12 PM window
2. Added check for complete data before fetching
3. Skip users who already have both scores for today
4. Allows retries until Oura has morning data ready

Timing adjustments:
1. Initially moved fetch from 6 AM to 8 AM for better data availability
2. Then switched to retry window for robustness

## Key Design Decisions

- Sleep/readiness format "75/82" compact but informative
- Slash character added to tiny font to support this format
- Hourly retry window (7 AM - 12 PM) covers typical Oura sync times
- Skip already-fetched users to avoid redundant API calls
- Color coding uses same green/yellow/red thresholds for consistency

## What's Next

- Could add weekly trend indicators
- Consider HRV or other metrics if display space allows
