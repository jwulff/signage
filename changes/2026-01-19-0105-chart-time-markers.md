# Chart Time Marker Fixes

*Date: 2026-01-19 0105*

## Why

The vertical time markers (midnight, 6am, noon, 6pm) on the glucose chart had several issues:
1. Midnight markers were invisible (black on black background)
2. Markers didn't appear when viewing during the same hour (e.g., midnight marker missing at 12:30am)
3. The 21hr and 3hr charts overlapped, causing duplicate markers

## How

1. Changed marker colors from grayscale to purple-yellow gradient (purple for midnight, yellow for noon)
2. Fixed off-by-one bug in `calculateTimeMarkers` where `hoursAgo <= 0` should be `hoursAgo < 0`
3. Added `offsetHours` parameter to `ChartConfig` so the 21hr chart shows -24h to -3h instead of -21h to now

## Key Design Decisions

- Purple `{120,50,180}` chosen for midnight visibility against black background
- Yellow `{120,100,25}` for noon to indicate daytime
- Cosine curve interpolates colors between markers based on hour
- 21hr chart offset by 3 hours to eliminate overlap with 3hr chart

## What's Next

- Consider adding more time markers (e.g., every 3 hours) for finer granularity
- Could add subtle grid lines for glucose thresholds
