# Display Compositor with Blood Sugar

*Date: 2026-01-18 0023*

## Why

The clock and blood sugar widgets were running as separate cron jobs, each sending full 64x64 frames. This caused them to overwrite each other - whichever fired last "won". The Pixoo can only display one frame at a time, so we needed a compositor to combine both widgets into a single frame.

## How

Created a compositor that:
1. Allocates display regions to each widget (top half: clock, bottom half: blood sugar)
2. Fetches data for all widgets in a single Lambda invocation
3. Renders each widget to its assigned region
4. Broadcasts the combined frame to all connected terminals

Layout (64x64 pixels):
- **Rows 0-31**: Clock (time + AM/PM)
- **Row 32**: Separator line
- **Rows 33-63**: Blood sugar (BG value + trend/delta)

## Key Design Decisions

- **Single cron job**: Replaced separate clock and blood sugar crons with one compositor cron. This eliminates race conditions and reduces Lambda invocations.
- **Region-based rendering**: Each widget renders to a bounded region, preventing overlap.
- **Graceful degradation**: If blood sugar data fails to fetch, shows "BG ERR" in the bottom region while clock continues working.
- **Color coding**: Blood sugar uses standard diabetes range colors - green (70-180), yellow (high), orange (low), red (urgent), gray (stale).

## What's Next

- Add more widgets to the compositor (weather, calendar)
- Consider dynamic layout based on which widgets have data
