# Blood Sugar Frame Renderer

*Date: 2026-01-18 0023*

## Why

The blood sugar widget was using the dispatcher pattern which sends `widget-update` messages with raw data. However, the relay only handles `frame` messages containing pre-rendered 64x64 bitmaps. This meant blood sugar data wasn't appearing on the Pixoo display - only the clock widget was visible because it already renders frames directly.

## How

Created a new blood sugar renderer that follows the same pattern as the clock widget:
1. Fetches glucose data from Dexcom Share API
2. Renders the data to a 64x64 pixel frame
3. Broadcasts the frame to all connected terminals

The renderer displays:
- "BG" header at top (cyan)
- Glucose value in center (color-coded by range)
- Trend arrow below value
- Delta (change) at bottom (gray)

## Key Design Decisions

- **Direct frame rendering**: Rather than using the dispatcher/renderer architecture, this follows the simpler clock pattern of rendering frames directly in the scheduled handler. This is more straightforward for a single widget.
- **Color coding**: Uses standard diabetes range colors - green for normal (70-180), yellow for high, orange for low, red for urgent low/very high, gray for stale data.
- **Stale detection**: Data older than 10 minutes is shown in gray to indicate potential sensor issues.

## What's Next

- Consider consolidating clock and blood sugar into a unified rendering framework
- Add more widgets (weather, calendar, etc.) using the same pattern
