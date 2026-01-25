# Glooko Data Latency Indicator

*Date: 2026-01-25 0723*

## Why
Glooko treatment data is always delayed (typically 2-3 hours). Without knowing when data was last fetched, it's unclear whether today's (or yesterday's) insulin total is complete or partial.

## How
Added a latency indicator to the right of the treatment chart's "today" insulin total:
- Shows time since last Glooko data fetch
- Format: "Xm" for < 60 minutes, "Xh" (ceil to nearest hour) for >= 60 minutes
- Uses same white/grey color as the clock time indicator for consistency

## Key Design Decisions
- **Same style as glucose latency**: Matches the "5m" format used for glucose data freshness
- **Hours rounded up**: At >= 60m, we ceil to the nearest hour (e.g., 65m shows as "2h") for simpler display
- **Right-aligned**: Placed after the "today" number since it represents the freshness of that data

## What's Next
- Monitor if the indicator is useful in practice
- Consider color-coding (e.g., yellow/red) if latency exceeds certain thresholds
