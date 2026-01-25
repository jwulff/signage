# Tweak trend arrow shapes

*Date: 2026-01-25 0030*

## Why

Follow-up adjustments to trend arrow pixels after visual testing.

## How

Restored corner pixels and full horizontal line that were previously removed:

- **fortyfiveup/fortyfivedown**: Restored far corner pixel (`#....`)
- **flat**: Restored full horizontal line (`#####`)

## Key Design Decisions

- Keep diagonal arrows with full corner-to-corner span for better directionality
- Full horizontal line on flat arrow improves visibility

## What's Next

None - visual tuning complete.
