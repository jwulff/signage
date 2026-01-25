# Adjust trend arrow pixel shapes

*Date: 2026-01-25 0022*

## Why

The trend arrows needed visual adjustments for better clarity on the 64x64 LED display.

## How

Updated the 5x5 bitmap definitions for trend arrows:

- **doubleup/doubledown**: Added corner pixels on the middle row for visual balance
- **fortyfiveup/fortyfivedown**: Shifted arrowhead to `.####`, added notch pixel, removed far corner
- **flat**: Changed horizontal line from `#####` to `.####`

## Key Design Decisions

- Maintained 5x5 pixel grid to match existing font height
- Changes improve arrow readability at small display sizes

## What's Next

None - visual adjustment complete.
