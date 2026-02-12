---
title: "refactor: Replace Bedrock Agent with direct InvokeModel"
type: refactor
date: 2026-02-11
---

# refactor: Replace Bedrock Agent with direct InvokeModel

## Overview

Replace the Bedrock Agent framework (4 action groups, 12 APIs, multi-turn tool calling) with a single `InvokeModel` call per insight. Lambda pre-fetches all data and passes it inline in the prompt. The model returns structured JSON (`content` + `reasoning`) via forced tool_use. No agent framework, no session memory.

**Motivation**: Each agent invocation costs 5+ Bedrock API roundtrips, re-sending the full conversation context each time. With ~36 invocations/day at ~$7/day. Direct InvokeModel reduces this to 1 API call per invocation at ~$2-3/day.

**Brainstorm**: `docs/brainstorms/2026-02-11-tool-use-reduction-brainstorm.md`

## Architecture Change

```
BEFORE:
  Stream Consumer → InvokeAgent → Agent orchestrates 4+ tool calls → storeInsight tool → DynamoDB

AFTER:
  Stream Consumer → pre-fetch data from DynamoDB → InvokeModel (single call) → parse JSON → write DynamoDB
```

## Key Design Decisions

1. **Structured output via tool_use** — Force the model to call a `respond` tool with `content` and `reasoning` parameters. Parse response by searching for `tool_use` block by type (not index — Claude may emit text before the tool call).

2. **Single PR** — Delete agent infra in the same PR as the InvokeModel switch. If something breaks, revert the PR. No phased deploy ceremony.

3. **Small shared `invokeModel()` function** — ~30 lines wrapping BedrockRuntimeClient + tool_use parsing. Used by all three handlers. System prompt passed as parameter, not owned by the utility.

4. **Inline data fetching** — Each handler fetches its own data directly from `@diabetes/core`. No shared `prefetch.ts` abstraction.

5. **Validate-then-store** — Check insight length/quality *before* writing to DynamoDB. Store reasoning + glucoseAtGeneration + zoneAtGeneration in a single `storeInsight()` call.

6. **Dedup: log and skip** — If dedup rejects, the existing insight stays displayed. No retry. The model already sees insight history in the prompt.

7. **Simple error handling** — Success: parse + store. Failure: log + throw (Lambda retries handle transients).

## Technical Reference

### InvokeModel Request Format

```typescript
// invoke-model.ts — small shared utility
const response = await client.send(new InvokeModelCommand({
  modelId: process.env.MODEL_ID, // inference profile ARN
  contentType: "application/json",
  accept: "application/json",
  body: JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    tool_choice: { type: "tool", name: "respond" },
    tools: [{
      name: "respond",
      description: "Store your insight for the LED display",
      input_schema: {
        type: "object",
        properties: {
          content: { type: "string", description: "Insight with color tag, max 30 visible chars" },
          reasoning: { type: "string", description: "Why you chose this insight" }
        },
        required: ["content", "reasoning"]
      }
    }]
  })
}));

// Parse — search by type, not index
const result = JSON.parse(new TextDecoder().decode(response.body));
const toolUseBlock = result.content.find((b: { type: string }) => b.type === "tool_use");
if (!toolUseBlock) throw new Error("Model did not return tool_use block");
return toolUseBlock.input as { content: string; reasoning: string };
```

### Prompt Structure

System prompt = current `AGENT_INSTRUCTION` persona + style rules + color codes (from `infra/agent.ts:24-51`).

User message = pre-fetched data + analysis instructions:

```
## Current Context
Time: 10:32 PM Pacific | Glucose: 185 mg/dL (high) | Trend: dropping

## 3-Hour Glucose Trajectory (most recent first)
10:30 PM: 185  10:25 PM: 188  10:20 PM: 191  ... (~36 readings)

## Today's Stats
TIR: 62% | Mean: 165 | Range: 72-225 | Readings: 180

## Recent Treatments (3hr)
9:15 PM: 0.1u correction  8:45 PM: 0.1u correction

## Recent Insights (6hr)
[9:15 PM] [green]Steady high, one more?[/]
[8:00 PM] [yellow]Been high since dinner[/]

[data grounding steps + writing rules from current prompt]
Call the respond tool with content and reasoning.
```

### IAM & Environment Changes

```diff
# analysis-pipeline.ts
- actions: ["bedrock:InvokeAgent"]
- resources: [agentAlias.agentAliasArn]
+ actions: ["bedrock:InvokeModel"]
+ resources: [
+   $interpolate`arn:aws:bedrock:${region}:${accountId}:inference-profile/us.anthropic.claude-sonnet-4-5*`,
+   $interpolate`arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-5*`,
+ ]

- AGENT_ID: agent.agentId,
- AGENT_ALIAS_ID: agentAlias.agentAliasId,
+ MODEL_ID: $interpolate`arn:aws:bedrock:${region}:${accountId}:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0`,
```

## Implementation Checklist

### 1. Create `invoke-model.ts`
- [x] `invokeModel(systemPrompt, userMessage): Promise<{ content: string; reasoning: string }>`
- [x] BedrockRuntimeClient, InvokeModelCommand, forced tool_use
- [x] Parse tool_use block by type (`.find(b => b.type === "tool_use")`)
- [x] On error: throw (Lambda retry handles transients)

### 2. Rewrite `stream-trigger.ts`
- [x] Pre-fetch inline: glucose 3hr, stats 24hr, treatments 3hr, insight history 6hr (all from `@diabetes/core`)
- [x] Build prompt with pre-fetched data + system prompt from current agent instruction
- [x] Call `invokeModel()`, validate response (length, quality) BEFORE storing
- [x] Dedup check before store (move from `tools/insight.ts`; use `getRecentInsightContents()`)
- [x] If dedup rejects: log and return (existing insight stays)
- [x] Single `storeInsight()` call with content, reasoning, glucoseAtGeneration, zoneAtGeneration
- [x] Keep `enforceInsightQuality()` but rewrite to use `invokeModel()` for retries
- [x] Update fallback text from `"Data updated chk app"` to `"[yellow]Check your app[/]"`
- [x] Delete: `invokeAgent()`, `extractReasoningFromResponse()`, `extractInsightFromResponse()`

### 3. Rewrite `daily.ts`
- [x] Pre-fetch inline: yesterday's CGM readings, stats, insight history
- [x] Fix timezone bug: `formatDateInTimezone()` instead of `toISOString().split("T")[0]`
- [x] Call `invokeModel()`, store result
- [x] Delete local `invokeAgent()` and `extractInsightFromResponse()`

### 4. Rewrite `weekly.ts`
- [x] Pre-fetch inline: 7-day CGM readings, stats, insight history
- [x] Call `invokeModel()`, store result
- [x] Delete local `invokeAgent()` and `extractInsightFromResponse()`

### 5. Update `infra/analysis-pipeline.ts`
- [x] IAM: `bedrock:InvokeAgent` → `bedrock:InvokeModel` with inference profile ARN
- [x] Env vars: `AGENT_ID`/`AGENT_ALIAS_ID` → `MODEL_ID`
- [x] Remove import of `agent`, `agentAlias` from `./agent`

### 6. Delete agent infrastructure
- [x] Delete `infra/agent.ts`
- [x] Delete `infra/agent-tools.ts`
- [x] Delete `packages/functions/src/diabetes/tools/` directory
- [x] Move `stripMarkup` from `tools/insight-utils.ts` to `@diabetes/core` before deleting
- [x] Update `sst.config.ts`: remove `import("./infra/agent")` and agent outputs (`agentId`, `agentAliasId`)
- [x] Remove `@aws-sdk/client-bedrock-agent-runtime` from `package.json`
- [x] Keep `infra/knowledge-base.ts` (out of scope)

### 7. Tests
- [x] Existing `stream-trigger.test.ts` tests pass
- [x] New test for `invokeModel()`: tool_use response parsing, missing fields, empty content array

### 8. Changes file
- [x] `changes/YYYY-MM-DD-HHMM-drop-agent-framework-direct-invokemodel.md`

## References

- Brainstorm: `docs/brainstorms/2026-02-11-tool-use-reduction-brainstorm.md`
- Agent infra: `infra/agent.ts:166-189`, `infra/agent-tools.ts`
- Stream consumer: `packages/functions/src/diabetes/analysis/stream-trigger.ts`
- Analysis pipeline: `infra/analysis-pipeline.ts`
- Insight dedup: `packages/functions/src/diabetes/tools/insight.ts:70-124`
- Glucose queries: `packages/functions/src/diabetes/tools/glucose.ts:98-180`
- Timezone helpers: `packages/diabetes/src/storage/keys.ts:57-118`
- Daily timezone bug: `packages/functions/src/diabetes/analysis/daily.ts:59-60`
- `stripMarkup`: `packages/functions/src/diabetes/tools/insight-utils.ts`
- Cost journey: `changes/2026-02-11-2210-restore-sonnet-after-rate-limiting.md`
- Related PRs: #231, #232, #234, #235, #237
