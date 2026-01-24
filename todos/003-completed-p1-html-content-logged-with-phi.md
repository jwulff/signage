---
status: completed
priority: p1
issue_id: "003"
tags: [code-review, security, logging, phi]
dependencies: []
---

# HTML Page Content Logged with Potential PHI

## Problem Statement

When login fails, the scraper logs the first 2000 characters of HTML page content to console/CloudWatch, which may contain user-identifying information or health data.

## Findings

**Location:** `packages/functions/src/glooko/scraper.ts` line 263

**Evidence:**
```typescript
console.error("Page HTML (first 2000 chars):", html.substring(0, 2000));
```

**Impact:**
- HTML content may include:
  - User's name in page title
  - Email addresses
  - Health data if partially loaded
  - Session tokens
- This data persists in:
  - CloudWatch Logs (potentially indefinitely)
  - Local terminal output
  - Log aggregation systems

## Proposed Solutions

### Option A: Log Structural Info Only (Recommended)
Replace HTML dump with diagnostic information that doesn't include content.

**Pros:** Preserves debugging capability without PHI exposure
**Cons:** Less context for debugging
**Effort:** Small
**Risk:** Low

```typescript
console.error("Login page state: selectors not found", {
  title: await page.title(),
  url: page.url(),
  hasEmailInput: !!(await page.$('input[type="email"]')),
  hasPasswordInput: !!(await page.$('input[type="password"]')),
});
```

### Option B: Remove Entirely
Delete the HTML logging.

**Pros:** Eliminates risk
**Cons:** Harder to debug login failures
**Effort:** Small
**Risk:** Low

## Recommended Action

Option A - Log structural info only

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/scraper.ts` line 263

## Acceptance Criteria

- [ ] No raw HTML content logged
- [ ] Diagnostic info available for debugging
- [ ] No PHI in CloudWatch logs

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during security review | Error logs can leak PHI |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
