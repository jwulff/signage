# Treatment Chart 3-Day Insulin Comparison

*Date: 2026-01-24 2215*

## Why
Glooko treatment data is always delayed, making the 3h "recent" section of the treatment chart perpetually empty. That space can be better used to show actionable insights.

## How
Split the treatment chart into two distinct sections:
- **Left half**: Bar chart showing individual treatments (insulin down, carbs up) for the 21h window (24h-3h ago), matching the glucose chart's left section
- **Right half**: 3 numbers showing total insulin for the same 21h window across 3 consecutive days:
  - 72-51h ago (dimmest blue)
  - 48-27h ago (medium blue)
  - 24-3h ago (brightest blue)

## Key Design Decisions
- **Same time window comparison**: All 3 periods use the exact same 21h window (offset by 24h each) for apples-to-apples comparison
- **Insulin only in comparison**: Carbs are shown as bars on the left but the comparison focuses on insulin since it's more actionable for dosing decisions
- **Brightness for recency**: Older periods are dimmer, newest is brightest - instant visual pattern recognition

## What's Next
- Consider adding carbs comparison below insulin if space permits
- Could add trend indicator (arrow) if today vs yesterday differs significantly
