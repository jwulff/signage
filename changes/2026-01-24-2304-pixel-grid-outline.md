# Black pixel grid outline in web emulator

*Date: 2026-01-24 2304*

## Why

The web emulator's pixel grid was hard to see with faint white lines. Black outlines around each pixel make the grid more visible and give a clearer representation of the Pixoo's discrete LED matrix.

## How

Changed the grid line stroke color from `rgba(255, 255, 255, 0.1)` to solid black (`#000`).

## Key Design Decisions

- Used solid black (`#000`) rather than semi-transparent black for maximum contrast
- Kept the 1px line width for subtle but visible outlines

## What's Next

None - this is a complete visual enhancement.
