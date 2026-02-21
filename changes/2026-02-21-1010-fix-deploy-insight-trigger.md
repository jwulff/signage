# Fix Deploy Insight Trigger

*Date: 2026-02-21 1010*

## Why
The "Trigger fresh insight" post-deploy step has been failing since PR #237 (Feb 12)
because the `signage-ci` IAM user lacks `dynamodb:ListTables` permission. The SST
deploy itself succeeds, but the workflow reports failure due to this step.

## How
Replaced `aws dynamodb list-tables` with `pnpm sst shell --stage prod` to get the
table name from SST resource metadata. SST already knows the table name and injects
it as `SST_RESOURCE_SignageTable` — no additional IAM permissions needed.

## Key Design Decisions
- Used SST shell instead of adding IAM permissions — avoids expanding the CI user's
  permissions and uses the source of truth (SST state) for resource names
- Kept the same update-item logic — only changed how the table name is discovered

## What's Next
- Deploy workflow should report green on next merge to main
