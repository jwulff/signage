# Treatment Chart: 36-Hour Insulin Totals with Daylight Bars

*Date: 2026-01-24 2215*

## Why
Glooko treatment data is always delayed, making the 3h "recent" section of the treatment chart perpetually empty. The full treatment chart space can be better used to show actionable insulin insights.

## How
Display 36 hours of insulin totals in 6-hour buckets with daylight time markers:
- **6 buckets**: Each showing total insulin units for a 6-hour period
  - Bucket 0 (36h-30h ago) → Bucket 5 (6h-0h ago, most recent)
- **5 daylight bars**: 1px vertical lines between buckets showing time-of-day
  - Purple (midnight) → Yellow (noon) gradient based on boundary hour
- **Brightness gradient**: Older buckets are dimmer, newest is brightest blue

## Key Design Decisions
- **6-hour buckets**: Match natural meal/dosing rhythms (breakfast, lunch, dinner, overnight)
- **Daylight bars**: Provide time context using the same purple→yellow gradient as the glucose chart, making it easy to correlate insulin with time of day
- **Full-width layout**: Removed the split left/right design to maximize readability
- **Insulin-only focus**: Carbs removed since insulin is more actionable for dosing decisions

## What's Next
- Consider adding a simple trend indicator comparing recent buckets
- Could show carbs as a secondary row if vertical space permits
