# Drop Bedrock Agent Framework for Direct InvokeModel

*Date: 2026-02-12 0015*

## Why

Each Bedrock Agent invocation triggers 5+ API roundtrips as the agent orchestrates tool calls (get glucose, get stats, get treatments, get insights, store insight). At ~36 invocations/day on Claude Sonnet 4.5, this costs ~$7/day ($210/month) in redundant prompt re-sends. The agent framework also adds latency and complexity (4 action group Lambdas, OpenAPI schemas, IAM roles, agent alias versioning).

The insight text is 30 characters for an LED display. The model doesn't need multi-turn reasoning — it just needs the data up front.

## How

Replaced the Bedrock Agent framework with direct `InvokeModel` calls. Each Lambda (stream, daily, weekly) now:
1. Pre-fetches its own data from DynamoDB via `@diabetes/core`
2. Formats the data into a single prompt
3. Calls Claude via `InvokeModel` with forced `tool_use` for structured JSON output
4. Validates the response, then stores it

Created a small shared `invoke-model.ts` utility (~80 lines) that wraps `BedrockRuntimeClient` + `InvokeModelCommand` with tool_use parsing. Used by all three handlers.

## Key Design Decisions

- **Forced tool_use for structured output** — The `respond` tool guarantees `{ content, reasoning }` JSON. No regex parsing of free-text responses.
- **Single PR** — Deleted agent infra (agent.ts, agent-tools.ts, tools/ directory) in the same PR as the InvokeModel switch. Simpler to reason about and revert if needed.
- **Validate-then-store** — Check insight length and quality before writing to DynamoDB, not after. Up to 2 retry attempts if the model generates something too long or invalid.
- **Dedup: log and skip** — If an identical insight was recently generated, keep the existing one. No re-invoke.
- **Fixed daily.ts timezone bug** — Replaced `yesterday.toISOString().split("T")[0]` (which returns UTC date, wrong after 4 PM PST) with `formatDateInTimezone()` from `@diabetes/core`.

## What Changed

- `packages/functions/src/diabetes/analysis/invoke-model.ts` — New shared utility
- `packages/functions/src/diabetes/analysis/stream-trigger.ts` — Rewrote: pre-fetch + InvokeModel
- `packages/functions/src/diabetes/analysis/daily.ts` — Rewrote: pre-fetch + InvokeModel + timezone fix
- `packages/functions/src/diabetes/analysis/weekly.ts` — Rewrote: pre-fetch + InvokeModel
- `infra/analysis-pipeline.ts` — IAM: InvokeAgent → InvokeModel; env: AGENT_ID → MODEL_ID
- `sst.config.ts` — Removed agent import and outputs
- Deleted: `infra/agent.ts`, `infra/agent-tools.ts`, `packages/functions/src/diabetes/tools/`
- Removed: `@aws-sdk/client-bedrock-agent-runtime` dependency

## What's Next

- Monitor costs after deploy — expect drop from ~$7/day to ~$2-3/day
- Monitor CloudWatch for insight quality at same level as agent-based approach
- Consider switching to Haiku 4.5 again once cost baseline is established
