# Reorder display layout: chart at bottom

*Date: 2026-02-01 2020*

## Why
User preference - the chart at the bottom felt better visually. The date at top is good, but the middle section order needed adjustment.

## How
Reordered the vertical sections while keeping the same vertical sizes:
- Date/time: rows 1-5 (unchanged)
- Insights: rows 7-18 (moved from bottom)
- Insulin: rows 20-26 (moved up)
- Glucose reading: rows 28-32 (moved down)
- Chart: rows 34-63 (moved to bottom, expanded to 30 rows)

## Key Design Decisions
- Chart gets 30 rows (was 28), slightly larger at the bottom
- Insights now more prominent, right below the date
- Glucose reading directly above chart for visual connection

## What's Next
- Evaluate the new layout in daily use
