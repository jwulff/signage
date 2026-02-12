---
title: Insight Rate Limiting Strategy
type: feat
date: 2026-02-11
---

# Insight Rate Limiting Strategy

## Overview

Replace the 5-minute debounce on Bedrock agent invocations with a smart rate-limiting strategy that only generates new insights when glucose conditions meaningfully change or 60 minutes have elapsed. Combined with the Haiku 4.5 switch, this reduces Bedrock costs by ~85-90% while keeping insights responsive to real glucose events.

## Problem Statement

The stream trigger currently invokes the Bedrock agent on every CGM reading (~288/day, ~12/hour) with only a 5-minute debounce. Most invocations produce insights that replace a still-relevant one minutes later. This wastes money and produces moment-in-time insights that age poorly.

## Proposed Solution

### Trigger Conditions

Generate a new insight when **ANY** of these are true:

| # | Trigger | Threshold | Data Source |
|---|---------|-----------|-------------|
| 1 | Time elapsed | >= 60 min since last hourly insight | `currentInsight.generatedAt` |
| 2 | Rapid change | Consecutive CGM delta >= 15 mg/dL | Current stream record vs previous CGM query |
| 3 | Gradual drift | abs(current glucose - last insight glucose) >= 30 mg/dL | `currentInsight.glucoseAtGeneration` |
| 4 | Zone change | Current zone != last insight zone | `currentInsight.zoneAtGeneration` |

**Zone boundaries** (local to trigger logic only, does not change renderer/stats):

| Zone | Range |
|------|-------|
| `low` | < 70 mg/dL |
| `caution` | 70–84 mg/dL |
| `in-range` | 85–180 mg/dL |
| `high` | > 180 mg/dL |

### Edge Cases

**No previous insight** (cold start, or current insight is `daily`/`weekly` type, or missing `glucoseAtGeneration`): Unconditionally generate. Log reason as `first-hourly`.

**Zone oscillation**: The zone-change trigger inherently debounces because `zoneAtGeneration` updates on each new insight. However, oscillation at a boundary (69→71→69) still triggers on each crossing. Add a 15-minute cooldown: if the ONLY matching trigger is zone-change AND elapsed < 15 min, skip.

**Non-CGM records**: Remove `BOLUS`, `BASAL`, `CARBS` from `TRIGGER_TYPES`. All four trigger conditions require a glucose value, which these records don't carry. Treatment analysis is handled by daily/weekly crons. This simplifies the trigger logic and avoids ~20% of current invocations that produce no new information.

**Daily/weekly cron interaction**: The rate-limiting logic checks `currentInsight.type`. If it's not `"hourly"` or `glucoseAtGeneration` is missing, treat as cold start and generate. No need for a separate DynamoDB key.

**Existing insights without new fields**: On first deploy, the current insight won't have `glucoseAtGeneration`/`zoneAtGeneration`. This triggers the cold-start path, generating a fresh insight with the new fields. Self-healing.

### Storage Changes

Add two optional fields to the `Insight` interface:

```typescript
// packages/diabetes/src/models/insights.ts
export interface Insight {
  content: string;
  type: InsightType;
  generatedAt: number;
  metrics?: InsightMetrics;
  reasoning?: string;
  glucoseAtGeneration?: number;  // NEW: glucose when insight was created
  zoneAtGeneration?: string;     // NEW: zone when insight was created
}
```

The stream-trigger handler sets these fields via UpdateCommand on the CURRENT insight record AFTER the agent stores it. This keeps the InsightTools Lambda and agent prompt unchanged — the agent doesn't need to know about these fields.

Also update `storeInsight()` to accept and pass through the new optional fields.

### Prompt Changes

Two files need prompt updates:

**`infra/agent.ts` — AGENT_INSTRUCTION (system prompt)**:
- Add: "Your insights display on the LED for up to 60 minutes. Write about the current situation or pattern, not the current moment."
- Change "next 30 minutes" references to "next hour" if present in system prompt

**`packages/functions/src/diabetes/analysis/stream-trigger.ts` — stream trigger prompt**:
- Change: "What is the ONE thing that matters most in the next 30 minutes?" → "What is the current story? What pattern or situation best describes what's happening?"
- Add: "This insight will display for up to 60 minutes. Avoid narrow time references like 'right now' or 'just happened'. Instead use broader descriptions: 'steady afternoon', 'trending up since lunch', 'smooth overnight'."
- Keep existing rules about trajectory, near-low caution, post-low rebounds

### Logging

One log line per CGM stream event:

**On invoke** (list all matching triggers):
```
Insight triggered: time-elapsed,drift | glucose=172 zone=in-range elapsed=63min delta=+4 drift=+32
```

**On skip**:
```
Insight skipped: glucose=120 zone=in-range elapsed=35min delta=+3 drift=+8
```

### Previous CGM Reading Query

To compute consecutive delta (trigger #2), query the most recent CGM reading before the current one. One DynamoDB query per stream event, limit 1, on the date partition. Cost: ~$0.03/year for 288 queries/day. The query uses `queryByTypeAndTimeRange` or a direct Query on `pk=USR#{userId}#CGM#{date}` with `ScanIndexForward: false`, limit 2, taking the second result.

## Technical Approach

### File Changes

#### 1. `packages/diabetes/src/models/insights.ts`
- Add `glucoseAtGeneration?: number` and `zoneAtGeneration?: string` to `Insight` interface

#### 2. `packages/diabetes/src/storage/insights.ts`
- Update `storeInsight()` signature to accept optional `glucoseAtGeneration` and `zoneAtGeneration`
- Include them in both CURRENT and HISTORY DynamoDB items when provided

#### 3. `packages/functions/src/diabetes/analysis/stream-trigger.ts`
Major changes:
- Remove `BOLUS`, `BASAL`, `CARBS` from `TRIGGER_TYPES` (CGM only)
- Change `DEBOUNCE_MS` from 5 min to new constants:
  ```typescript
  const INSIGHT_INTERVAL_MS = 60 * 60_000;      // 60 minutes
  const RAPID_CHANGE_THRESHOLD = 15;              // mg/dL between consecutive readings
  const DRIFT_THRESHOLD = 30;                     // mg/dL from last insight glucose
  const ZONE_CHANGE_COOLDOWN_MS = 15 * 60_000;   // 15 min cooldown for zone-only triggers
  ```
- Extract `glucoseMgDl` from stream event `NewImage.data.M.glucoseMgDl.N`
- Add `getInsightZone(glucose: number)` function returning `"low" | "caution" | "in-range" | "high"`
- Replace debounce block (lines 74-84) with trigger evaluation:
  1. Get `currentInsight` (already done)
  2. If null / not hourly / missing `glucoseAtGeneration` → generate (cold start)
  3. Query previous CGM reading for delta
  4. Evaluate all four triggers
  5. Apply zone-oscillation cooldown
  6. Log result (invoke or skip)
- After agent stores insight, UpdateCommand to set `glucoseAtGeneration` and `zoneAtGeneration` on CURRENT record

#### 4. `infra/agent.ts`
- Update `AGENT_INSTRUCTION` to mention 60-minute display duration and situation-based framing

#### 5. `packages/functions/src/diabetes/analysis/stream-trigger.ts` (prompt section)
- Update the multi-step prompt at lines 92-157 with situation-based framing

#### 6. Tests
- `packages/functions/src/diabetes/analysis/stream-trigger.test.ts` — Add test cases for:
  - `getInsightZone()` boundary values
  - Trigger evaluation: all four conditions individually
  - Cold start (no previous insight)
  - Cold start (daily insight as current)
  - Zone oscillation cooldown
  - Multiple triggers firing simultaneously
  - Skip when no triggers met
  - CGM-only trigger types (verify BOLUS/BASAL/CARBS excluded)
- `packages/diabetes/src/storage/insights.test.ts` (if exists, or new) — Test `storeInsight` with new fields

### Implementation Order (TDD)

1. **Model change**: Add fields to `Insight` interface
2. **Storage change**: Update `storeInsight()` to accept/store new fields + tests
3. **Zone function**: Write `getInsightZone()` + tests
4. **Trigger evaluation**: Extract as pure function `shouldGenerateInsight()` + tests
5. **Wire into handler**: Replace debounce with trigger evaluation + glucose extraction
6. **Post-store update**: Add UpdateCommand for `glucoseAtGeneration`/`zoneAtGeneration`
7. **Prompt updates**: Agent instruction + stream trigger prompt
8. **Logging**: Add structured log lines

## Acceptance Criteria

- [ ] Insights generate only when a trigger condition is met (time, rapid change, drift, or zone change)
- [ ] No insight generation for BOLUS/BASAL/CARBS records (CGM only)
- [ ] First insight after deploy generates successfully (cold start path)
- [ ] Zone oscillation at boundaries doesn't produce > 4 insights/hour
- [ ] `glucoseAtGeneration` and `zoneAtGeneration` stored on every new hourly insight
- [ ] Agent prompt references 60-minute display window and situation-based framing
- [ ] Every CGM reading produces a log line (invoke with reasons, or skip with values)
- [ ] Daily/weekly cron insights are unaffected
- [ ] All existing tests continue to pass
- [ ] New tests cover all four trigger conditions and edge cases

## Success Metrics

- Bedrock invocations drop from ~288/day to ~24-48/day (stable periods: 24, active management: up to 48)
- Combined with Haiku 4.5 switch: total daily cost drops from ~$55 to ~$2-4
- No missed critical glucose events (lows, rapid spikes still trigger promptly)

## Dependencies & Risks

- **Risk**: Zone oscillation could still produce too many invocations if glucose hovers at a boundary for hours. The 15-min cooldown mitigates this to max 4/hour.
- **Risk**: Removing non-CGM triggers means a large bolus won't immediately produce an insight. Mitigated by: the CGM reading 5 min later will show the effect, and drift/zone-change triggers catch the glucose response.
- **Dependency**: The Haiku 4.5 model switch (PR #231, merged) must be deployed first for accurate cost projections.

## References

- Brainstorm: `docs/brainstorms/2026-02-11-insight-rate-limiting-brainstorm.md`
- Current stream trigger: `packages/functions/src/diabetes/analysis/stream-trigger.ts`
- Insight model: `packages/diabetes/src/models/insights.ts`
- Insight storage: `packages/diabetes/src/storage/insights.ts`
- Agent prompt: `infra/agent.ts:24-50`
- Existing zone classifier: `packages/diabetes/src/analysis/glucose-stats.ts:140-148`
