# Text Rendering and Pixoo Display Fixes

*Date: 2026-01-14 2200*

## Why

With the basic infrastructure working (WebSocket API, relay, web emulator), we needed:

1. A way to display text messages on the Pixoo (P0 goal: "Hi Courtney")
2. Reliable frame delivery without caching issues
3. Automatic display mode switching so the Pixoo shows our content

## How

### Text Rendering

Created a 5x7 pixel bitmap font supporting A-Z, a-z, 0-9, and common punctuation:

- `packages/functions/src/font.ts` - Font data as binary bitmaps
- Updated `test-bitmap.ts` with `?pattern=text&text=Hello&color=pink` support
- 9 color options: white, red, green, blue, yellow, cyan, magenta, orange, pink
- Multi-line support with `\n` delimiter and auto-centering

### Pixoo Frame Caching Fix

The Pixoo caches frames by `PicID` and ignores duplicates. When the relay restarted, the counter started at 1 again, causing frames to be silently dropped.

**Fix**: Use timestamp-based PicID (`Date.now() % 100000`) to ensure uniqueness across restarts.

### Display Channel Auto-Switch

The Pixoo has multiple display modes (channels):
- 0: Clock faces
- 1: Cloud/online content
- 2: Audio visualizer
- 3: Custom (API-controlled)

Frames were being accepted (`error_code: 0`) but not displayed because the Pixoo was on a different channel.

**Fix**: Relay now calls `Channel/SetIndex` to switch to channel 3 on startup.

## Commits

- `6605b19` Add text rendering support with 5x7 pixel font
- `3e246c4` Fix Pixoo frame caching by using timestamp-based PicID
- `3bb58ce` Auto-switch Pixoo to custom channel on relay startup

## What's Next

1. Add WebSocket keepalive ping (currently every 5 min, may need tuning)
2. Deploy updated Lambda with text rendering to AWS
3. Consider persisting relay state for auto-reconnect
4. Build first real widget (clock, weather, etc.)
