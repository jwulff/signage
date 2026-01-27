# Tweak trend arrows and layout

*Date: 2026-01-25 0030*

## Why

Follow-up adjustments to trend arrow pixels and display layout for better visual clarity.

## How

**Arrow tweaks:**
- fortyfiveup/fortyfivedown: Restored far corner pixel (`#....`)
- flat: Restored full horizontal line (`#####`)

**Layout reorganization:**
- Swapped glucose reading and insulin totals so glucose is right above sparkline
- Equally spaced 4 sections above sparkline:
  - Rows 3-7: Date/time
  - Rows 12-19: Weather band
  - Rows 23-27: Insulin totals
  - Rows 32-36: Glucose reading
  - Rows 40-62: Sparkline (unchanged)

## Key Design Decisions

- Glucose reading adjacent to sparkline provides better visual context
- Equal spacing creates cleaner visual hierarchy
- Diagonal arrows with full corner-to-corner span for better directionality

## What's Next

None - visual tuning complete.
