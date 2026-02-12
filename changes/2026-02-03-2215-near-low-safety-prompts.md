# Near-Low Safety Prompts

*Date: 2026-02-03 2215*

## Why

The agent was generating dangerously optimistic insights near glucose lows:

- At 85 → 80 → 77 → 75 (still dropping): `[green]Leveling off nicely![/]` — wrong,
  she's about to go low
- At 78 → 105 (steep +27 rise after treating low): `[green]Smooth landing![/]` —
  wrong, that's a rebound spike that may overshoot
- At 136 with +11/reading rise rate: `[green]Smooth landing![/]` — wrong, still
  climbing from a low

These false celebrations could lead to under-treating lows or ignoring post-low
rebound spikes.

## How

### Trajectory Over Current Value (PR #225)

Added guidance that a reading's meaning depends on direction:
- 80 while rising = great
- 80 while dropping = concerning
- Key question: "Where will she be in 10-15 minutes?"

### Near-Low Caution Zone (PR #225)

For glucose 75-90 and still dropping:
- Only celebrate "Leveling off!" when readings are actually flat (±3 mg/dL)
  for 2-3 consecutive readings
- 78 → 77 → 78 → 79 = actually leveling
- 85 → 80 → 77 → 75 = still dropping, not leveling

### Post-Low Rebound Detection (PR #226)

After treating a low, glucose often spikes from the sugar:
- +5-10 per reading = gentle recovery (OK to celebrate)
- +20-30 per reading = rebound overshoot risk (warn, don't celebrate)
- A true landing: 70 → 82 → 88 → 92 → 95 (gradual rise, then leveling)
- Not a landing: 70 → 85 → 105 → 130 (steep spike = rebound)

### Landing Means FLAT (PR #227)

Clarified that "landing" requires flat readings, not just any non-dropping state:
- "Rising steady" or "Coming up nicely" for gentle rises (+5-10/reading)
- "Coming up fast!" for steep rises (+20-30/reading)
- Reserve "Landed!" for FLAT readings (±3 for 2-3 consecutive)

## Key Design Decisions

- **Trajectory-first thinking**: Always project forward 10-15 minutes rather than
  reacting to the current number
- **Intervention lag awareness**: Sugar takes 10-15 minutes to work, so "still
  dropping after juice" gets patient encouragement, not panic
- **Explicit bad examples**: Added labeled bad examples (e.g., `[green]Smooth
  landing![/]` when 78→105) since the agent learns from counterexamples

## PRs

- #225: Nuanced near-low guidance to prevent false confidence
- #226: Post-low rebound guidance to prevent overshoot blindness
- #227: Clarify that landing means FLAT, not still rising

## What's Next

- Monitor for false celebrations near lows in production insights
- Consider adding explicit glucose floor detection (approaching 70)
