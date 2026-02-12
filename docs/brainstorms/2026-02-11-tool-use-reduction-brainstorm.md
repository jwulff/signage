# Drop Bedrock Agent Framework — Direct InvokeModel

*Date: 2026-02-11*

## What We're Building

Replace the Bedrock Agent framework with a direct `InvokeModel` call. All data currently fetched by 4 action groups (12 APIs) will be pre-fetched in Lambda and passed inline in the prompt. The model's only job is to return a 30-character insight with reasoning — no tool calls at all.

## Why This Approach

### Current Cost Problem

Each agent invocation uses minimum 4 tool calls (3 data reads + 1 store), and each tool call is a full Bedrock API roundtrip that re-sends the entire conversation context. With Sonnet 4.5 at ~36 invocations/day (post rate-limiting), this is ~$7/day. Eliminating tool-call roundtrips cuts input tokens by ~75%.

### Why Not Just Reduce Tool Calls?

The Bedrock Agent framework has inherent overhead:
- Session management, memory, action group routing
- Each tool call re-sends the full system prompt + conversation history
- The agent decides which tools to call, adding latency and token cost
- We don't need multi-turn reasoning — the task is deterministic: read data, write insight

### Why Direct InvokeModel Works

The insight generation task is simple enough for a single prompt:
1. Lambda pre-fetches glucose readings, stats, and insight history (data it already has access to)
2. Prompt includes all data inline — model sees everything in one shot
3. Model returns structured response (insight content + reasoning)
4. Lambda parses response and writes to DynamoDB

No tools needed. No multi-turn. No agent framework.

## Key Decisions

### 1. Full Pre-Fetch in Lambda

**Decision**: Pre-fetch all data in the stream consumer Lambda before calling the model.

**Data to pre-fetch**:
- Recent glucose readings (3 hours) — already queried for rate-limiting triggers
- Glucose stats (day summary) — simple DynamoDB query
- Recent insight history (6 hours) — simple DynamoDB query

**Why**: The Lambda already has DynamoDB access and already queries glucose data for rate-limiting evaluation. Extending it to fetch stats and insight history is trivial.

### 2. Drop the Bedrock Agent Framework

**Decision**: Replace `InvokeAgent` with direct `InvokeModel` (Bedrock runtime API).

**What changes**:
- No more agent alias, action groups, or agent versioning
- No more 4 Lambda functions for tool handling
- Single `InvokeModel` call with all data in the prompt
- Parse insight content + reasoning from model response
- Lambda writes insight directly to DynamoDB

**What stays**:
- Sonnet 4.5 as the model
- Same prompt/instruction quality (data grounding steps)
- Same rate-limiting triggers in stream consumer
- Same DynamoDB schema for insights

**Infrastructure to remove**:
- `infra/agent.ts` — agent, alias, action groups, IAM roles
- `infra/agent-tools.ts` — tool schemas and Lambda functions
- `packages/functions/src/diabetes/agent-tools/` — 4 tool handler Lambdas
- Agent-related IAM policies

**Infrastructure to add**:
- `bedrock:InvokeModel` permission on stream consumer Lambda role
- Structured prompt template in stream consumer

### 3. Drop Session Memory

**Decision**: Remove Bedrock Agent session memory (SESSION_SUMMARY). Use insight history query instead.

**Why**: The agent's 30-day session memory was meant to avoid repeating insights. But we already query recent insight history (last 6 hours) and include it in the prompt — this serves the same purpose without the agent framework overhead.

## Estimated Impact

| Metric | Current (Agent) | After (Direct) |
|--------|-----------------|----------------|
| API roundtrips per invocation | 5+ (orchestration + tools) | 1 |
| Input tokens per invocation | ~10K-15K (re-sent each roundtrip) | ~3K-5K (single shot) |
| Latency per invocation | ~15-30s (multi-turn) | ~3-8s (single call) |
| Daily cost (Sonnet, ~36 inv/day) | ~$7/day | ~$2-3/day |
| Infrastructure complexity | Agent + 4 Lambdas + alias + IAM | Single Lambda + InvokeModel |

## Open Questions

1. **Response parsing** — Use structured JSON output or parse freeform text? JSON is more reliable but adds prompt tokens. Likely JSON with a simple schema: `{ "content": "[green]...[/]", "reasoning": "..." }`.

2. **Prompt migration** — The current agent instruction has tool-specific language ("Call getRecentGlucose..."). Needs rewriting to reference inline data instead of tool calls.

3. **Phased rollout or big bang?** — Could keep agent infra temporarily and A/B test, but the agent has no easy way to disable tool calls. Likely just switch over.

4. **Error handling** — If InvokeModel fails, retry? Skip? The current agent has built-in retry logic. Lambda will need its own.

## Next Steps

Run `/workflows:plan` to create an implementation plan covering:
- Pre-fetch implementation in stream consumer
- Prompt template design (inline data format)
- InvokeModel integration
- Infrastructure removal (agent, action groups, tool Lambdas)
- Testing strategy
