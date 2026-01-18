# Compositor Improvements

*Date: 2026-01-18 0036*

## Why

After deploying the initial compositor, two improvements were needed:

1. **Wrong timezone**: The clock was showing UTC time because Lambda runs in UTC by default. Users in Pacific timezone saw times 8 hours ahead.

2. **Limited blood sugar data**: The initial display only showed glucose value and trend. Users wanted to see more context: delta (change), and how fresh the reading is.

## How

### Pacific Timezone

Used JavaScript's `toLocaleString` with timezone option to convert UTC to Pacific:

```typescript
const pacificTime = new Date(
  now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
);
```

### Enhanced Blood Sugar Display

Expanded the bottom half of the display to show:

```
┌────────────────────────┐
│         120            │  ← Glucose (color-coded)
│        ^ +5            │  ← Trend arrow + delta
│          3m            │  ← Minutes since reading
└────────────────────────┘
```

Added `timestamp` to the blood sugar data and a `minutesAgo()` helper to calculate reading freshness.

## Key Design Decisions

- **Hardcoded Pacific**: Rather than making timezone configurable, hardcoded to `America/Los_Angeles` since this is a personal project for a specific household.
- **Minutes not "ago"**: Display just "3m" instead of "3m ago" to save horizontal space on the 64-pixel display.
- **Color-coded trend**: The trend arrow and delta now use the same color as the glucose value (green/yellow/orange/red based on range).

## What's Next

- Consider showing mmol/L for international users
- Add visual indicator when data is stale (>10 minutes old)
- Potentially show graph/sparkline of recent readings
