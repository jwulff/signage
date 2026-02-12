# Switch Bedrock Agent from Sonnet 4.5 to Haiku 4.5

*Date: 2026-02-11 2015*

## Why
The stream-triggered analysis costs ~$55/day ($1,700/month) on Claude Sonnet 4.5. The agent generates 30-character LED display insights, well within Haiku's capability. Switching to Haiku 4.5 drops costs to ~$14/day ($434/month) — a 73% reduction.

## How
Updated the Bedrock agent's foundation model from Sonnet 4.5 to Haiku 4.5, and updated the corresponding IAM policy ARNs to grant access to the new model.

## Key Design Decisions
- Haiku 4.5 is sufficient for generating short LED display insight strings
- Both IAM policy ARNs (foundation model and inference profile) updated together to maintain consistency

## What's Next
- Monitor Bedrock costs after deploy to confirm ~$14/day
- Check CloudWatch logs to verify insights are still generated correctly
