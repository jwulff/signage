# Restore Sonnet 4.5 After Rate Limiting

*Date: 2026-02-11 2210*

## The Journey

Three changes tonight, each building on the last:

1. **Switch to Haiku 4.5** (PR #231) — Cut cost from ~$55/day to ~$14/day by switching the Bedrock agent from Sonnet 4.5 to Haiku 4.5. The agent writes 30-character LED insights, so Haiku seemed capable enough.

2. **Add rate limiting** (PR #232, #234) — Replaced the 5-minute debounce with four smart triggers (time-elapsed, rapid-change, drift, zone-change). Invocations dropped from ~288/day to ~24-48/day. Added a data grounding step to the prompt after Haiku hallucinated "steady drop since 8pm" when the sparkline showed a spike-then-decline.

3. **Restore Sonnet 4.5** (this PR) — Even with prompt grounding, Haiku's reasoning quality isn't good enough. It still produces loosely-grounded insights. With rate limiting cutting invocations by ~87%, Sonnet now costs ~$7/day ($210/month) — cheaper than Haiku was *before* rate limiting ($14/day). Better quality at lower cost. Easy decision.

## Why

The original Sonnet cost problem ($55/day) was never about the model — it was about calling it 288 times a day. Rate limiting fixed the real issue. Now we get Sonnet-quality insights at a fraction of the original cost.

## How

Reverted the model ARN and IAM policy changes from PR #231:
- Foundation model: `us.anthropic.claude-haiku-4-5-20251001-v1:0` → `us.anthropic.claude-sonnet-4-5-20250929-v1:0`
- IAM policy ARNs: `anthropic.claude-haiku-4-5*` → `anthropic.claude-sonnet-4-5*`

## Cost Summary

| Configuration | Invocations/day | Cost/day | Cost/month |
|---|---|---|---|
| Sonnet + 5min debounce (before) | ~288 | ~$55 | ~$1,700 |
| Haiku + 5min debounce (PR #231) | ~288 | ~$14 | ~$434 |
| Haiku + rate limiting (PR #232) | ~36 | ~$1.75 | ~$53 |
| **Sonnet + rate limiting (this PR)** | **~36** | **~$7** | **~$210** |

## What's Next
- Monitor cost and quality over the next few days
- The data grounding prompt (PR #234) stays — it helps Sonnet too
- Consider further reducing invocations with time-of-day awareness (longer intervals overnight)
