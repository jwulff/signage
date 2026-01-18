# Bedrock IAM Permission Fixes

*Date: 2026-01-17 2220*

## Why

The News Digest widget was failing with IAM permission errors when calling AWS Bedrock:

1. **Inference Profiles**: Nova models use inference profiles, which require a separate IAM resource ARN pattern (`arn:aws:bedrock:*:*:inference-profile/*`).

2. **Cross-Region Access**: Bedrock models are region-specific, but the web grounding feature may route to different regions. The IAM policy was too restrictive.

## How

Updated the IAM permissions in `infra/test-api.ts`:

```typescript
permissions: [
  {
    actions: ["bedrock:InvokeModel"],
    resources: [
      "arn:aws:bedrock:*::foundation-model/*",
      "arn:aws:bedrock:*:*:inference-profile/*",
    ],
  },
],
```

Key changes:
- Added `inference-profile` resource pattern for Nova models
- Used `*` for region to allow cross-region inference
- Used `*` for account ID on inference profiles (they're account-scoped)

## Key Design Decisions

- **Broad region access**: Rather than listing specific regions, allow all regions since Bedrock's routing is opaque.
- **Separate resource patterns**: Foundation models and inference profiles have different ARN structures, so both patterns are needed.

## What's Next

- Monitor Bedrock costs across regions
- Consider region-specific policies if cost becomes a concern
