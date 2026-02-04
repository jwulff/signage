# Deeper Analysis: Actionable Insights with Reasoning

*Date: 2026-02-04 0530*

## Why

The LED display insights were generating vague, general commentary like "Mornings are tough" or "Nights dip at 3am" — observations that don't help in the moment. We needed insights that either:
1. **Suggest an action** based on current glucose and trends
2. **Celebrate a win** to reinforce good outcomes

Additionally, we had no visibility into *why* the agent chose each insight, making prompt refinement guesswork.

## What Changed

### Actionable Insights (PRs #220-223)

**Before:**
```
[blue]Mornings are tough[/]
[yellow]Nights dip at 3am[/]
[blue]Patterns detected[/]
```

**After:**
```
[yellow]Still rising, correct?[/]     ← actionable tip
[red]Dropping fast, juice?[/]         ← urgent action
[green]Smoother than yesterday![/]    ← celebrate win
[green]Leveling off nicely![/]        ← affirm good trend
```

### Rate of Change Intelligence

The agent now assesses **acceleration vs deceleration**:

| Pattern | Interpretation | Response |
|---------|---------------|----------|
| Decelerating drop | Slowing down, leveling off | Celebrate: "Leveling off nicely!" |
| Accelerating drop | Speeding up toward low | Urgent: "Dropping fast, juice?" |
| Decelerating rise | Slowing down | Patience, may not need action |
| Accelerating rise | Speeding up toward high | Action: "Still climbing, correct?" |

This prevents false alarms like "[red]Still falling, eat now!" when glucose is actually stabilizing.

### Reasoning Capture

Every insight now stores the agent's reasoning for later review:

```json
{
  "content": "[yellow]Dropping fast, watch it?[/]",
  "reasoning": "Context: 5 minutes ago showed 'Steadier today!' You've dropped 180 mg/dL in 4 hours (from 365 → 185 now). That's an average drop of 45 mg/dL per hour — quite rapid!"
}
```

This enables:
- Understanding why the agent chose each insight
- Identifying prompt improvements
- Debugging unexpected outputs

### Quality Safeguards

- Reasoning is only stored when the original insight passes quality checks
- If `enforceInsightQuality` rewrites the insight, reasoning is skipped (would be stale)
- Examples in the prompt use qualitative terms ("high→less high→normal") to avoid confusion with the "no exact numbers" rule

## Key Design Decisions

1. **Two categories only** — Actionable tips OR celebrate wins. No vague observations.

2. **Parse reasoning from response** — Bedrock doesn't enforce required parameters, so we extract reasoning from the agent's natural response text rather than relying on tool parameters.

3. **Acceleration over direction** — A drop that's slowing down is good news; a drop that's speeding up needs attention. Direction alone isn't enough.

4. **Guard stale reasoning** — If the insight gets rewritten by quality checks, the original reasoning no longer applies and is discarded.

## PRs

- #220: Parse reasoning from agent response and store it
- #221: Focus insights on actionable tips and celebrating wins  
- #222: Factor in rate of change acceleration for urgency
- #223: Address review feedback (stale reasoning guard, qualitative examples)

## Sample Output

```
📍 [yellow]Dropping fast, watch it?[/]
   Reasoning: 5 minutes ago showed "[green]Steadier today![/]". 
   You've dropped 180 mg/dL in 4 hours (365 → 185). 
   That's 45 mg/dL per hour — quite rapid!

📍 [green]Brought it down nicely![/]
   Reasoning: You had an intense spike to 365, now recovered to 106.
   Celebrating the successful correction.

📍 [red]Still falling, eat now![/]
   Reasoning: Previous insight was "Still dropping, snack?" but 
   you're now at 93 and still falling. More urgent action needed.
```

## What's Next

- Monitor reasoning quality to identify prompt improvements
- Consider time-of-day context (bedtime insights vs morning insights)
- Explore meal prediction based on historical patterns
