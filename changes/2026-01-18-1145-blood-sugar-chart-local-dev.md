# Blood Sugar Chart, Local Dev Server, and Time-Series Storage

*Date: 2026-01-18 1145*

## Why

The blood sugar widget needed historical context - just showing the current reading doesn't tell you if you're trending up, down, or stable. We also needed a faster development loop than deploying to AWS for every change.

## How

### Sparkline Chart
- Added 3-hour history chart below the current reading
- Adaptive Y-axis scaling based on actual data range (not fixed 40-400)
- Dim green background shows target range (70-180 mg/dL)
- Tiny 3x5 pixel font for "3h" legend

### Graphical Trend Arrows
- Replaced text characters with 7x8 pixel arrow bitmaps
- Outlined arrow heads (not filled) for cleaner look
- All directions: double-up, up, forty-five-up, flat, forty-five-down, down, double-down

### Dynamic Text Layout
- Full spacing when it fits: `→ 194 +8 5m`
- Compact spacing for double-digit deltas: `→ 213+13 5m`
- Two-tone colors: glucose in range color, delta/time in white

### Local Development Server
- WebSocket server on port 8080 mirrors production architecture
- Interactive credential setup saves to `.env.local`
- Shares rendering code with production via `@signage/functions/rendering`
- Mock data mode when no Dexcom credentials

### ASCII Frame Renderer
- Debug tool to visualize frames in terminal
- Run: `pnpm --filter @signage/local-dev exec tsx src/debug-frame.ts`
- Useful for testing layout changes without browser

### Time-Series Storage (DynamoDB)
- History store with TTL for automatic cleanup
- Backfill detection for gap filling after reconnect
- Batch write support for efficient history imports

## Key Design Decisions

- **Adaptive chart scaling**: Fixed ranges waste vertical space when readings are stable. Dynamic scaling shows meaningful variation.
- **Shared rendering module**: Local dev and production use identical rendering code, preventing drift.
- **Two-tone text colors**: Breaking up the dense information with color helps readability at a glance.

## What's Next

- Deploy to production and verify chart renders on Pixoo64
- Add more widgets (weather, calendar)
- Consider longer history options (6h, 12h, 24h)
