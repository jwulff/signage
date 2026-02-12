# Trigger Fresh Insight on Every Deploy

*Date: 2026-02-11 2235*

## Why

After deploying prompt or model changes, the rate-limiting strategy (PR #232) could
delay the next insight by up to 60 minutes. This made it hard to validate changes
quickly — you'd deploy a prompt tweak and wait an hour to see if it worked.

## How

Added a post-deploy step to the GitHub Actions deploy workflow that resets the
insight timer in DynamoDB. The next CGM reading after deploy (~5 minutes) triggers
a fresh insight with the latest prompt and model, giving near-immediate feedback.

## Key Design Decisions

- Resets the timer rather than invoking the agent directly, so the insight still
  flows through the normal stream-trigger path with real CGM data
- No code changes to the insight system itself — just a workflow step

## PRs

- #237: Add post-deploy insight timer reset to GitHub Actions

## What's Next

- Monitor that the "Trigger fresh insight" step runs reliably on deploys
