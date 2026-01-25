# Compact Layout with Separate Treatment Chart

*Date: 2026-01-24 2132*

## Why
The display needed optimization for better data density and readability:
- The 5x7 font was larger than necessary, limiting chart space
- Oura readiness data wasn't providing value ("not vibing with it")
- Treatment data (insulin/carbs) was mixed into the glucose display instead of having its own visualization

## How
1. **Switched to 3x5 compact font** - All text rendering now uses the smaller font, freeing up vertical pixels
2. **Removed Oura readiness data** - Eliminated from display, compositor, and data fetching
3. **Created dedicated treatment chart** - Insulin bars go down from center, carbs bars go up (12px height)
4. **Expanded glucose sparkline** - Now 23px tall (was 21px), getting 2/3 of available chart space

## Key Design Decisions
- **Font consolidation**: Rather than maintaining two font systems, redirected all `drawText()` calls to use the 3x5 font
- **Treatment chart visualization**: Bar chart with center baseline - insulin (blue) goes down, carbs (orange) goes up. Matches the 21h|3h split layout of glucose chart
- **Space allocation**: Treatment chart gets 1/3 (12px), glucose chart gets 2/3 (23px) of post-header vertical space
- **5x5 trend arrows**: Shrunk from 7x8 to match smaller font proportions

## What's Next
- Fine-tune treatment chart scaling based on real-world insulin/carb ranges
- Consider adding treatment totals display in the header area
