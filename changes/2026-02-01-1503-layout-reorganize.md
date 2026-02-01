# Reorganize Display Layout for Better Glucose Monitoring

*Date: 2026-02-01 1503*

## Why

The previous layout had significant wasted black space between elements. The glucose chart was only 23 pixels tall, limiting the visual resolution for trend analysis. The user wanted to maximize chart space by reorganizing the display order.

## How

Reorganized the 64x64 display layout from top to bottom:
1. Date/time (rows 1-5) - stays at top
2. Glucose reading with trend (rows 7-11) - moved up from row 32
3. Glucose chart (rows 13-40, **28 rows**) - expanded from 23 to 28 rows
4. Insulin data (rows 42-48) - moved below chart
5. AI Insights (rows 52-63) - stays at bottom

Removed the weather/sunlight band to reclaim vertical space for the chart.

## Key Design Decisions

- **Chart expansion**: Increased chart height from 23 to 28 pixels (22% larger) for better trend visibility
- **Glucose reading near top**: Puts the most important number (current glucose) right after the time, improving glanceability
- **Removed weather band**: Sacrificed weather visualization to maximize glucose chart space (weather data API still accepted for future use)
- **Insulin below chart**: Placed historical insulin data below the chart since it's less time-critical than current glucose

## What's Next

- Consider adding weather back as a thin strip or indicator if users miss it
- Potentially add more data points to the expanded chart area
