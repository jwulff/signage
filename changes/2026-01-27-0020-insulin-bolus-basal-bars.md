# Insulin Display: Bolus/Basal Ratio Bars

*Date: 2026-01-27 0020*

## Why

The insulin display showed daily totals but didn't indicate how much was bolus vs basal insulin. This ratio is clinically meaningful - a typical split is roughly 50/50, and seeing the breakdown helps identify patterns in insulin delivery.

## How

1. **Extended to 5 days** - Show 5 days of insulin totals instead of 4 for better trend visibility

2. **Added ratio bars** - Below each daily total, display a 7px-wide bar showing:
   - Light purple (left): bolus percentage
   - Dark purple (right): basal percentage
   - Bar width represents 100% of that day's total insulin

3. **Fixed date calculation bug** - The midnight calculation was skipping days when current time was close to midnight. Changed from subtracting 30h (which overshot) to subtracting 1h from each midnight to reliably land in the previous day.

4. **Restored latency indicator** - Time since last insulin delivery (e.g., "5m", "2h") shown after the 5 day totals

## Key Design Decisions

- **Bolus calculated from treatments array** - Individual bolus records are summed per day
- **Basal = total - bolus** - Total comes from DAILY_INSULIN records (includes basal + bolus from pump)
- **Brightness gradient preserved** - Both numbers and bars fade from dim (oldest) to bright (newest)
- **Colors match Glooko** - Light purple for bolus, dark purple for basal (from their charts)

## What's Next

- Could add daily carb totals if space permits
- Consider showing basal rate changes on the glucose sparkline
