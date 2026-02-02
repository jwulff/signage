---
title: "feat: Event-Driven Analysis Triggers"
type: feat
date: 2026-02-01
---

# Event-Driven Analysis Triggers

## Overview

Replace the hourly cron-based analysis with DynamoDB Streams event-driven triggers. Analysis runs immediately when new diabetes data arrives from Glooko or Dexcom, providing fresher insights without wasted compute when no new data exists.

## Problem Statement

The current hourly cron approach has limitations:
- **Stale insights**: Data arrives, but analysis waits up to 59 minutes
- **Wasted compute**: Analysis runs even when no new data exists
- **Timing misses**: Data written just after cron runs waits the longest

## Proposed Solution

Enable DynamoDB Streams on the existing table. A new Lambda function subscribes to the stream, filters for diabetes record types, and triggers Bedrock Agent analysis when relevant data arrives.

**Key design decisions** (from brainstorm):
- Trigger on: `cgm`, `bolus`, `basal`, `carbs` only
- Freshness filter: Only trigger on data from last 15 minutes (skip historical backfills)
- Debounce: Skip if analysis ran in last 60 seconds
- Serial processing: Lambda concurrency = 1
- Comprehensive analysis: Each run analyzes the full recent data window for the sign
- Keep daily/weekly crons: Fixed schedules for summaries

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Current (Cron-Based)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  Glooko/Dexcom → DynamoDB ← EventBridge (rate 1 hour) → Analysis Lambda │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                       Proposed (Event-Driven)                           │
├─────────────────────────────────────────────────────────────────────────┤
│  Glooko/Dexcom → DynamoDB → Stream → Filter → Debounce → Analysis       │
│                                                                         │
│  Daily/Weekly crons remain unchanged for comprehensive summaries        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation

#### 1. Enable DynamoDB Streams

**File: `infra/storage.ts`**

Add `stream: "new-image"` to the existing table configuration:

```typescript
export const table = new sst.aws.Dynamo("SignageTable", {
  // ... existing fields and indexes
  stream: "new-image",  // ADD THIS
});
```

#### 2. Create Stream Consumer Handler

**New file: `packages/functions/src/diabetes/analysis/stream-trigger.ts`**

```typescript
import type { DynamoDBStreamHandler } from "aws-lambda";
import { getCurrentInsight } from "@diabetes/core";

// Only these record types trigger analysis (UPPERCASE - matches keys.ts)
const TRIGGER_TYPES = new Set(["CGM", "BOLUS", "BASAL", "CARBS"]);

// Only analyze fresh data (skip historical backfills from Glooko)
const FRESHNESS_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

// Debounce: skip if last analysis was < 60 seconds ago
const DEBOUNCE_MS = 60_000;

export const handler: DynamoDBStreamHandler = async (event) => {
  const now = Date.now();

  // Filter for: INSERT + trigger type + fresh data only
  const relevantRecords = event.Records.filter((record) => {
    if (record.eventName !== "INSERT") return false;

    const pk = record.dynamodb?.NewImage?.pk?.S;
    if (!pk) return false;

    // PK format: USR#{userId}#{TYPE}#{date}
    const recordType = pk.split("#")[2];
    if (!TRIGGER_TYPES.has(recordType)) return false;

    // Skip historical backfills - only analyze fresh data
    const timestamp = record.dynamodb?.NewImage?.timestamp?.N;
    if (timestamp && now - Number(timestamp) > FRESHNESS_THRESHOLD_MS) {
      return false;
    }

    return true;
  });

  if (relevantRecords.length === 0) {
    console.log("No fresh relevant records, skipping");
    return;
  }

  // Debounce: check last analysis time
  const currentInsight = await getCurrentInsight();
  if (currentInsight && now - currentInsight.generatedAt < DEBOUNCE_MS) {
    console.log("Debounce: analysis ran recently, skipping");
    return;
  }

  // Run comprehensive analysis for the sign's two-line insight
  const sessionId = `stream-${now}`;
  await runAnalysis(sessionId);
};
```

**Key design decisions:**
- **Freshness filter**: Skip records older than 15 minutes (handles Glooko's 14-day backfills)
- **Debounce**: Skip if analysis ran in last 60s (handles rapid successive writes)
- **Comprehensive analysis**: Each run analyzes full recent data window for the sign
- **UPPERCASE types**: Matches `keys.ts` which calls `record.type.toUpperCase()`

#### 3. Wire Up Stream Subscription

**File: `infra/analysis-pipeline.ts`**

```typescript
// REMOVE: HourlyAnalysisCron definition and its IAM policy

// ADD: Stream consumer subscription
const analysisStreamConsumer = table.subscribe(
  "AnalysisStreamConsumer",
  {
    handler: "packages/functions/src/diabetes/analysis/stream-trigger.handler",
    link: [table],
    timeout: "120 seconds",
    memory: "512 MB",
    description: "Event-driven glucose analysis triggered by new diabetes data",
    environment: analysisEnvironment,
    reservedConcurrency: 1,  // Serial processing for batch writes
  }
);

// IAM policy for Bedrock Agent invocation
new aws.iam.RolePolicy("AnalysisStreamAgentPolicy", {
  role: analysisStreamConsumer.nodes.function.role,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: ["bedrock:InvokeAgent"],
        resources: [agentAlias.agentAliasArn],
        effect: "Allow",
      },
    ],
  }).json,
});

// KEEP: DailyAnalysisCron and WeeklyAnalysisCron unchanged
```

#### 4. Reuse Analysis Logic

Copy `invokeAgent()`, `enforceInsightLength()`, and `extractInsightFromResponse()` from `hourly.ts` into `stream-trigger.ts`. No shared module needed - hourly is being deleted.

## Acceptance Criteria

- [x] DynamoDB Streams enabled with `NEW_IMAGE` view type
- [x] Stream consumer filters for `CGM`, `BOLUS`, `BASAL`, `CARBS` (uppercase) only
- [x] Freshness filter: skip records older than 15 minutes (no historical backfill analysis)
- [x] Debounce: skip analysis if last ran < 60 seconds ago
- [x] Lambda `reservedConcurrency: 1` (serial processing)
- [x] Hourly cron removed; daily/weekly crons unchanged
- [x] Unit tests for filtering, freshness, and debounce logic

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `infra/storage.ts` | Modify | Add `stream: "new-image"` |
| `infra/analysis-pipeline.ts` | Modify | Remove hourly cron, add stream subscription |
| `packages/functions/src/diabetes/analysis/stream-trigger.ts` | Create | Stream consumer handler (~60 lines) |
| `packages/functions/src/diabetes/analysis/hourly.ts` | Delete | Replaced by stream trigger |

## Cost Estimate

| Component | Before (Hourly) | After (Event-Driven) |
|-----------|-----------------|----------------------|
| Analysis runs/day | 24 | ~288 (Dexcom's 5-min cycle) |
| Bedrock cost/month | ~$7 | ~$87 |
| Lambda invocations | Minimal | ~8,700/month |
| DynamoDB Streams | $0 | ~$2/month |
| **Total additional** | - | **~$80/month** |

**Note:** Freshness filter prevents runaway costs from Glooko's 14-day historical backfills. Debounce prevents rapid-fire analyses from batch writes.

## Rollback Plan

If issues arise:
1. Remove stream subscription from `infra/analysis-pipeline.ts`
2. Re-add `HourlyAnalysisCron` definition
3. Deploy

The table with streams enabled can remain - streams are only consumed if a Lambda subscribes.

## References

### Internal

- Brainstorm: `docs/brainstorms/2026-02-01-event-driven-analysis-brainstorm.md`
- Current hourly handler: `packages/functions/src/diabetes/analysis/hourly.ts`
- DynamoDB table: `infra/storage.ts`
- Analysis pipeline: `infra/analysis-pipeline.ts`
- Record types: `packages/diabetes/src/models/records.ts`
- Key patterns: `packages/diabetes/src/storage/keys.ts`

### SST v3 Documentation

- DynamoDB Streams: `table.subscribe()` method
- Lambda configuration: `sst.aws.Function` options
