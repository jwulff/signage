# Insight Rate Limiting Strategy

*Date: 2026-02-11*

## What We're Building

A smarter insight generation strategy that reduces Bedrock agent invocations from ~12/hour to ~1/hour in stable periods, while staying responsive to meaningful glucose changes. Insights will be written to stay relevant for up to 60 minutes instead of the current ~5-10 minute cadence.

## Why This Approach

Currently the stream trigger invokes Bedrock on every CGM reading (~12x/hour) with only a 5-minute debounce. Combined with the Haiku 4.5 switch, rate limiting will further reduce costs. More importantly, generating fewer but more thoughtful insights produces better content — the agent can focus on the "story" rather than narrating every 5-minute tick.

## Trigger Conditions

Generate a new insight when **ANY** of these are true:

| Trigger | Threshold | Purpose |
|---------|-----------|---------|
| Time elapsed | >= 60 min since last insight | Baseline refresh |
| Rapid change | Consecutive CGM delta >= 15 mg/dL (3/min) | Catch spikes and crashes |
| Gradual drift | Current glucose differs from last-insight glucose by >= 30 mg/dL | Catch slow trends |
| Zone change | Glucose crossed a zone boundary since last insight | Safety + context shift |

### Glucose Zones

| Zone | Range | Meaning |
|------|-------|---------|
| Low | < 70 mg/dL | Hypoglycemia |
| Caution | 70–85 mg/dL | Approaching low |
| In-range | 85–180 mg/dL | Target range |
| High | > 180 mg/dL | Above range |

Zone changes always trigger a new insight regardless of time or rate thresholds. This is the safety mechanism — a slow drift from 88 to 68 might not hit rate thresholds but crosses two zone boundaries.

## Prompt Changes

Shift from moment-in-time to situation-based insights:

- **Old framing**: "What is the ONE thing that matters most in the next 30 minutes?"
- **New framing**: "What is the current story?" — focus on the pattern/trend, not the moment
- Tell the agent insights display for up to 60 minutes, so avoid narrow time references
- Encourage: "steady afternoon", "riding high after lunch", "trending down since dinner"
- Discourage: "right now", "just happened", "at this moment"

## Storage Changes

Store additional fields with each insight for comparison:
- `glucoseAtGeneration`: The glucose value when the insight was created
- `zoneAtGeneration`: The glucose zone when the insight was created

These enable the drift and zone-change checks without querying CGM history.

## Key Decisions

- **Both rate checks**: Use consecutive reading delta (rapid spikes) AND last-insight comparison (gradual drift)
- **Zone-change safety**: Always trigger on zone transitions — catches slow drifts into danger zones that individual thresholds miss
- **Situation-based tone**: Insights describe the "story" not the "moment" — ages better over 60 minutes
- **30 mg/dL drift threshold**: Meaningful change over an hour without being too sensitive
- **Unaffected**: Daily (6 AM) and weekly (Sunday 8 AM) scheduled analyses run independently

## Logging Strategy

Every CGM reading (~288/day) gets a one-line log entry:

**On invoke**: Which trigger fired + values
- `"Insight triggered: zone_change (in-range → caution, glucose 82, elapsed 23m)"`
- `"Insight triggered: rapid_change (delta 18 mg/dL in 5m, glucose 205)"`
- `"Insight triggered: drift (30+ mg/dL from last insight: 140 → 172, elapsed 45m)"`
- `"Insight triggered: time_elapsed (62m since last insight, glucose 115)"`

**On skip**: One-line summary
- `"Insight skipped: elapsed 23m, delta 5, drift 12, zone same (in-range)"`

This gives enough data to validate thresholds in CloudWatch without being verbose.

## Open Questions

- Should the 60-min window be configurable or hardcoded?
