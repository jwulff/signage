# Reasoning Capture and Trend-Tinted Colors

*Date: 2026-02-02 2230*

## Why

Two independent improvements shipped the same day:

1. **No visibility into agent decisions**: Without knowing *why* the agent chose each
   insight, prompt refinement was guesswork. We couldn't tell if it was using the
   broader data sources, checking history, or detecting patterns.

2. **Flat visual hierarchy**: The delta value (glucose change) used the same color as
   the reading, and update timestamps were full white — competing with the glucose
   number for attention.

## How

### Reasoning Capture (PRs #216, #218, #219)

Added a `reasoning` field to the Insight model so the agent explains its thought
process with each insight:

- **Model**: Added `reasoning?: string` to `Insight` interface
- **Storage**: Updated `storeInsight` to accept and persist reasoning
- **Handler**: Pass reasoning through save path; include in history responses
- **OpenAPI schema**: Added `reasoning` parameter to `/storeInsight` (marked required)
- **Prompt**: Added Step 4 with explicit reasoning instructions

The agent was initially skipping the optional reasoning parameter, so two follow-up
PRs made the instruction more emphatic (#218) and enforced it at the API level (#219).

Example stored reasoning:
```
content: "[yellow]Mornings are tricky[/]"
reasoning: "Checked last 2 days - said 'In range!' yesterday.
getDailyAggregation shows 6-9am averages 180+ vs 120 rest of day.
Chose morning pattern since it's actionable and not recently mentioned."
```

### Trend-Tinted Delta Colors (PR #214)

Delta value now reflects trend direction by tinting the reading color:
- **Rising**: blends toward red (danger signal)
- **Falling**: blends toward blue (cooling signal)
- **Flat**: uses dimmed reading color

Update timestamps (glucose and insulin latency) switched from full white to
off-white (140,140,140) to be less visually competing.

## Key Design Decisions

- **Reasoning at API level**: Marked as required in OpenAPI rather than relying on
  prompt compliance, since Bedrock doesn't enforce required tool parameters
- **Reasoning with history**: Including reasoning in `fetchInsightHistory` lets the
  agent see its own past reasoning, enabling self-correction
- **Color blending over fixed colors**: Delta tinting uses the reading's base color
  shifted toward red/blue rather than hard-coded colors, keeping visual coherence

## PRs

- #214: Trend-tinted delta colors and off-white update times
- #216: Capture agent reasoning for prompt refinement
- #218: Make reasoning instruction more emphatic in prompt
- #219: Make reasoning required in storeInsight schema

## What's Next

- Use stored reasoning to identify prompt improvements
- Monitor whether reasoning quality degrades under Haiku vs Sonnet
