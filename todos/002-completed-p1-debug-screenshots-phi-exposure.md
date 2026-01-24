---
status: completed
priority: p1
issue_id: "002"
tags: [code-review, security, hipaa, phi]
dependencies: []
---

# Debug Screenshots May Expose PHI (Health Data)

## Problem Statement

The scraper saves full-page screenshots to `/tmp/` during local testing. These screenshots capture sensitive health data (blood glucose, insulin doses) and user credentials visible on screen, creating HIPAA violation risk.

## Findings

**Location:** `packages/functions/src/glooko/scraper.ts` multiple locations

**Evidence:**
```typescript
// Line 198 - Login page with email
await page.screenshot({ path: "/tmp/glooko-login.png", fullPage: true });

// Line 444 - Dashboard with health data
await page.screenshot({ path: "/tmp/glooko-dashboard.png", fullPage: true });

// Lines 342-345, 374-375, 406, 574-575, 672-676 - Additional screenshots
```

**Impact:**
- Screenshots capture:
  - User's email address on login page
  - Blood glucose readings (PHI)
  - Insulin doses (PHI)
  - Carbohydrate intake (PHI)
  - Any error messages containing PHI
- Risk of screenshots being:
  - Accidentally committed to git
  - Shared in bug reports
  - Persisting in development environments
  - Accessed by other Lambda invocations (Lambda `/tmp` is reused)

## Proposed Solutions

### Option A: Gate Behind Explicit Debug Flag (Recommended)
Only save screenshots when `DEBUG_SCREENSHOTS=true` environment variable is set.

**Pros:** Preserves debugging capability, explicit opt-in
**Cons:** Requires env var configuration
**Effort:** Small
**Risk:** Low

```typescript
const DEBUG_SCREENSHOTS = process.env.DEBUG_SCREENSHOTS === 'true';

if (DEBUG_SCREENSHOTS) {
  await page.screenshot({ path: "/tmp/glooko-login.png", fullPage: true });
}
```

### Option B: Remove All Screenshot Code
Delete all screenshot functionality entirely.

**Pros:** Eliminates risk completely
**Cons:** Loses debugging capability
**Effort:** Small
**Risk:** Low

### Option C: Auto-Delete After Use
Save screenshots but delete them immediately after debugging.

**Pros:** Preserves debugging, reduces persistence
**Cons:** Still writes to disk temporarily
**Effort:** Small
**Risk:** Medium

## Recommended Action

Option A - Gate behind explicit debug flag

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/scraper.ts` (7+ screenshot locations)

**Also Consider:**
- Add `.gitignore` entry for `/tmp/glooko-*`
- Clear `/tmp/` at Lambda start

## Acceptance Criteria

- [ ] No screenshots saved by default
- [ ] Debug mode requires explicit opt-in
- [ ] PHI cannot be exposed through normal operation
- [ ] `.gitignore` updated for safety

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during security review | Health data exposure risk via debug files |

## Resources

- HIPAA Security Rule: https://www.hhs.gov/hipaa/for-professionals/security/index.html
- PR #107: https://github.com/jwulff/signage/pull/107
