# Responsive Mobile Web Emulator

*Date: 2026-02-01 1955*

## Why

The web emulator canvas was fixed at 512x512 pixels, which overflowed iPhone screens and made it impossible to view the full display on mobile devices.

## How

Made the emulator responsive with several CSS and HTML changes:

- **Viewport constraints**: Added `max-width: 100vw` and `max-height: 100dvh` so canvas scales to fit any screen
- **User zooming**: Enabled pinch-to-zoom with `maximum-scale=5.0` for examining pixel details
- **Safe area padding**: Added `env(safe-area-inset-*)` for proper display on notched iPhones
- **Dynamic viewport height**: Used `100dvh` instead of `100vh` for correct mobile browser behavior
- **Crisp scaling**: Added `imageRendering: pixelated` to keep pixels sharp when canvas is scaled down

## Key Design Decisions

- **Scale down, not crop**: Rather than cropping the canvas, we scale it to fit while maintaining aspect ratio
- **Pixelated rendering**: CSS `imageRendering: pixelated` preserves the retro LED look when scaled, avoiding blur
- **Enable zooming**: Unlike many mobile apps that disable zooming, we allow it so users can inspect individual pixels

## What's Next

- Consider adding touch gestures for panning when zoomed
- May add a fullscreen toggle button for mobile
