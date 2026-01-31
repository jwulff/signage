# Fix: Prevent Double-Draw of Time Markers at Chart Boundary

*Date: 2026-01-30 2215*

## Why

When viewing the glucose sparkline at certain times (e.g., exactly 9:00 PM), a time marker that fell exactly at the boundary between the 21h and 3h chart sections would be drawn in both charts. This caused a visual artifact where a vertical line appeared at the boundary.

The issue was that the 6pm marker at exactly 9:00 PM was being drawn at x=31 (rightmost pixel of left chart) AND x=32 (leftmost pixel of right chart), because both chart segments used inclusive end conditions (`marker <= endTime`).

## How

Changed the left chart (offset charts) to use exclusive end for time marker range checks:
- Left chart: `marker >= startTime && marker < endTime` (exclusive end)
- Right chart: `marker >= startTime && marker <= endTime` (inclusive, unchanged)

This ensures markers at exactly the boundary timestamp are only drawn in one chart (the right chart at x=32), not both.

### Changes

**chart-renderer.ts**:
- Added `useExclusiveEnd` flag that's true when `offsetHours > 0`
- Changed marker range check to use exclusive end for offset charts

## Key Design Decisions

- **Offset charts use exclusive end**: When a chart has an offset (like the 21h chart ending at -3h), markers at exactly the boundary should appear in the adjacent non-offset chart instead. This prevents double-draw artifacts.

- **Right chart gets boundary markers**: Since the right chart shows the most recent 3 hours, a marker at exactly -3h makes more sense appearing at its left edge (the start) rather than the left chart's right edge.

## What's Next

- Monitor for any visual issues with markers near the boundary
- Consider adjusting the sunlight color gradient if 6pm markers still look too similar to midnight (both currently appear purple-ish)
