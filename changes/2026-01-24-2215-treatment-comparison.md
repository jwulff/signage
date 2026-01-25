# Treatment Chart: 4-Day Insulin Totals

*Date: 2026-01-24 2215*

## Why
Glooko treatment data is always delayed, making the 3h "recent" section of the treatment chart perpetually empty. The full treatment chart space can be better used to show actionable insulin insights. The previous 6-hour bucket design with daylight bars was visually too busy.

## How
Display last 4 days of insulin totals (midnight to midnight):
- **4 numbers**: Total insulin units for each calendar day
  - 3 days ago (dimmest) → Today (brightest)
- **Brightness gradient**: Older days are dimmer blue, today is brightest blue
- **No vertical separators**: Clean, minimal display of just the numbers
- **Midnight-to-midnight**: Each day counted from local midnight

## Key Design Decisions
- **Calendar days**: More intuitive than rolling time windows - "yesterday's total" is clearer than "24h-48h ago"
- **No divider bars**: Previous daylight bars added visual noise without much benefit in this context
- **4-day history**: Gives enough context to spot patterns (weekday vs weekend, for example)
- **Timezone-aware**: Uses local timezone for midnight calculations

## What's Next
- Monitor if 4 days is enough or if 5-7 days would be more useful
- Consider adding a trend arrow if today differs significantly from recent average
