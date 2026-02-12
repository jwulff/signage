# Insight Rate Limiting Strategy

*Date: 2026-02-11 2125*

## Why
The stream trigger invokes the Bedrock agent on every CGM reading (~288/day) with only a 5-minute debounce. Most invocations replace a still-relevant insight minutes later. This wastes money and produces moment-in-time insights that age poorly. Combined with the Haiku 4.5 switch (PR #231), smart rate limiting reduces costs by ~85-90%.

## How
Replaced the 5-minute debounce with four trigger conditions — a new insight generates only when ANY of these are true:
1. **Time elapsed**: >= 60 min since last hourly insight
2. **Rapid change**: Consecutive CGM delta >= 15 mg/dL
3. **Gradual drift**: Current glucose differs from last insight glucose by >= 30 mg/dL
4. **Zone change**: Glucose crossed a zone boundary (low <70, caution 70-85, in-range 85-180, high >180)

Zone oscillation has a 15-minute cooldown to prevent boundary-hovering from spamming the agent. Non-CGM records (BOLUS, BASAL, CARBS) are removed from trigger types since they lack glucose values.

The agent prompt was updated to produce situation-based insights that age well over 60 minutes instead of moment-in-time observations.

## Key Design Decisions
- Store `glucoseAtGeneration` and `zoneAtGeneration` on insight records to enable drift and zone-change detection without extra queries
- CGM-only triggers simplify logic; treatment analysis handled by daily/weekly crons
- Cold start path (missing fields or non-hourly current insight) unconditionally generates, making the migration self-healing
- Post-store UpdateCommand sets the new fields without modifying the agent's InsightTools Lambda

## What's Next
- Monitor CloudWatch logs for trigger distribution (time-elapsed vs rapid-change vs drift vs zone-change)
- Validate that ~24-48 invocations/day is the steady-state target
- Consider time-of-day awareness (longer intervals overnight)
