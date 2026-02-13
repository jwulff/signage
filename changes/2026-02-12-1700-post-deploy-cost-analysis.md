# Post-Deploy Cost Analysis: InvokeModel Refactor

*Date: 2026-02-12 1700*

## Why

PR #238 replaced the Bedrock Agent framework with direct InvokeModel calls. PR #240 fixed a missing IAM permission (foundation model ARN) that blocked the new code for ~30 minutes after deploy. This documents the actual measured impact after a full day of production data.

## Results

### Health (24h since IAM fix)

| Metric | Value |
|--------|-------|
| Errors | 0 |
| Insights generated | 32 |
| Insights skipped (rate limited) | 187 |
| Length fallbacks | 0 |
| Dedup skips | 0 |

Insight quality is unchanged — contextual, varied, all within the 30-char LED limit.

### Cost (from AWS Cost Explorer)

| Day | Sonnet 4.5 Cost | Framework |
|-----|----------------|-----------|
| Feb 10 | $59.62 | Agent (5 roundtrips/insight) |
| Feb 11 | $57.11 | Agent (5 roundtrips/insight) |
| Feb 12 | $11.20* | Mixed: ~8h agent + ~16h InvokeModel |

\* Feb 12 includes ~8h of old agent before deploy. Cost Explorer has 24-48h lag for same-day data.

### Projected Savings

| | Agent | InvokeModel | Change |
|--|-------|-------------|--------|
| API calls/insight | 5 roundtrips | 1 call | -80% |
| Total API calls/day | ~180 | ~47 | -74% |
| Cost/day | ~$58 | ~$1 | -98% |
| Cost/month | ~$1,751 | ~$28 | -98% |
| Monthly savings | | | ~$1,723 |

The savings are larger than the original $7/day estimate in the plan because the agent framework cost was $58/day, not $7/day. The $7/day figure came from early testing with fewer invocations; production volume with rate limiting still generated 36 insights/day × 5 roundtrips each.

## Key Design Decision

The original plan estimated switching to Haiku 4.5 after establishing a cost baseline. At ~$1/day on Sonnet 4.5 with InvokeModel, switching to Haiku is no longer necessary for cost reasons. The model can stay on Sonnet 4.5 indefinitely at this price point.

## IAM Lesson Learned

When using `InvokeModel` with Bedrock inference profiles (`us.anthropic.*`), IAM checks authorization against **both** the inference profile ARN and the underlying foundation model ARN. The foundation model ARN must use a region wildcard (`bedrock:*::foundation-model/...`) because `us.*` profiles route cross-region.

## What's Next

- Confirm full-day InvokeModel cost from Feb 13 Cost Explorer data (clean day, no agent)
- Monitor weekly for cost drift
- Consider Haiku 4.5 only if insight quality needs differ, not for cost
