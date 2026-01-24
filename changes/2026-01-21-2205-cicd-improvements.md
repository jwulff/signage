# CI/CD Improvements

*Date: 2026-01-21 2205*

## Why

Several CI/CD issues emerged during OSS preparation:
1. Flaky blood sugar test due to timing race condition
2. SST/Pulumi error formatter bug masking deployment errors
3. Missing secrets causing cryptic failures
4. Hardcoded domain preventing OSS users from deploying
5. Separate dev/prod stages adding complexity

## How

Test fix:
- Blood sugar test was calling Date.now() twice with time passing between
- Math.ceil() rounded 360.001 minutes up to 361, failing assertion
- Fixed by capturing timestamp once and reusing

Pulumi workaround:
- SST/Pulumi throws RangeError: Invalid string length in error formatter
- This happens even on successful deployments
- Added health endpoint verification to confirm deployment actually worked

Secrets handling:
- SST requires secrets defined before deployment
- Missing secrets cause errors masked by Pulumi bug
- Now set placeholder values for optional secrets if not configured

Domain configuration:
- Created SIGNAGE_DOMAIN environment variable
- Allows OSS users to deploy without modifying code
- GitHub Actions uses secrets for domain configuration
- Works without custom domain (falls back to AWS URLs)

Simplified deployment:
- Removed dev stage from deploy workflow
- Push to main now deploys directly to prod

## Key Design Decisions

- Health check verification more reliable than parsing Pulumi output
- Placeholder secrets allow partial deployments (e.g., without Oura)
- Environment variable for domain keeps infra code unchanged
- Single prod stage reduces confusion for OSS users

## What's Next

- Could add deployment status badges to README
- Consider adding rollback on health check failure
