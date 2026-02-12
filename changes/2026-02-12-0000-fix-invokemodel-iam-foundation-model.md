# Fix InvokeModel IAM — Add Foundation Model ARN

*Date: 2026-02-12 0000*

## Why

After deploying the InvokeModel refactor (PR #238), the stream-trigger Lambda failed with `AccessDeniedException` on `bedrock:InvokeModel`. The IAM policy only granted access to the inference profile ARN, but Bedrock checks authorization against **both** the inference profile and the underlying foundation model when using `InvokeModel` with inference profiles.

## How

Added the foundation model ARN (`arn:aws:bedrock:REGION::foundation-model/anthropic.claude-sonnet-4-5*`) as a second resource in each IAM policy alongside the inference profile ARN.

Also DRY'd the three identical policy documents into a single shared `invokeModelPolicy` variable.

## What Changed

- `infra/analysis-pipeline.ts` — Added `foundationModelArn` resource to IAM policies; extracted shared policy document

## What's Next

- Verify Lambda generates insights after deploy
