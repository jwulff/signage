# Post-Deploy Cost Analysis: InvokeModel Refactor

*Date: 2026-02-12 1700 — Updated 2026-02-21 with one week of verified data*

## Why

PR #238 replaced the Bedrock Agent framework with direct InvokeModel calls. PR #240 fixed a missing IAM permission (foundation model ARN) that blocked the new code for ~30 minutes after deploy. This documents the actual measured impact, initially after 24 hours and now verified over a full week of production data.

## Verified Results (Feb 13–18, one full week)

### Cost (from AWS Cost Explorer)

| Day | Sonnet 4.5 | Notes |
|-----|-----------|-------|
| Feb 05 | $57.95 | Agent framework |
| Feb 06 | $56.72 | Agent framework |
| Feb 07 | $56.03 | Agent framework |
| Feb 08 | $63.13 | Agent framework |
| Feb 09 | $59.30 | Agent framework |
| Feb 10 | $59.62 | Agent framework |
| Feb 11 | $57.11 | Agent framework |
| Feb 12 | $12.26 | Deploy day: ~8h agent + ~16h InvokeModel |
| Feb 13 | $1.67 | Direct InvokeModel |
| Feb 14 | $2.63 | Direct InvokeModel |
| Feb 15 | $2.76 | Direct InvokeModel |
| Feb 16 | $2.12 | Direct InvokeModel |
| Feb 17 | $2.31 | Direct InvokeModel |
| Feb 18 | $2.36 | Direct InvokeModel |

### Confirmed Savings

| | Agent (Feb 5–11) | InvokeModel (Feb 13–18) | Change |
|--|-------------------|-------------------------|--------|
| Avg cost/day | $58.55 | $2.31 | **-96%** |
| Daily range | $56.03 – $63.13 | $1.67 – $2.76 | Stable |
| Monthly run rate | $1,757 | $69 | **-$1,687/mo** |

No cost drift observed — daily cost is stable in the $1.67–$2.76 range across all seven days.

### Health (24h after deploy)

| Metric | Value |
|--------|-------|
| Errors | 0 |
| Insights generated | 32 |
| Insights skipped (rate limited) | 187 |
| Length fallbacks | 0 |

Insight quality is unchanged — contextual, varied, all within the 30-char LED limit.

## Key Design Decision

The original plan estimated switching to Haiku 4.5 after establishing a cost baseline. At ~$2.31/day on Sonnet 4.5 with InvokeModel, switching to Haiku is no longer necessary for cost reasons. The model stays on Sonnet 4.5 indefinitely at this price point.

## IAM Lesson Learned

When using `InvokeModel` with Bedrock inference profiles (`us.anthropic.*`), IAM checks authorization against **both** the inference profile ARN and the underlying foundation model ARN. The foundation model ARN must use a region wildcard (`bedrock:*::foundation-model/...`) because `us.*` profiles route cross-region.

## What's Next

- ~~Confirm full-day InvokeModel cost from Feb 13 Cost Explorer data~~ Done: $1.67
- ~~Monitor weekly for cost drift~~ Done: stable at $1.67–$2.76/day for 6 days
- Consider Haiku 4.5 only if insight quality needs differ, not for cost
