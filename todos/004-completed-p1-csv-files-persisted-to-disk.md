---
status: completed
priority: p1
issue_id: "004"
tags: [code-review, security, phi, data-persistence]
dependencies: []
---

# CSV Files with Health Data Persisted to Filesystem

## Problem Statement

Parsed CSV files containing health records (CGM readings, insulin doses, carbs, medications) are saved to `/tmp/glooko-csvs/` during local testing. Lambda's `/tmp` is reused across invocations, creating data persistence risk.

## Findings

**Location:** `packages/functions/src/glooko/scraper.ts` lines 788-794

**Evidence:**
```typescript
import("fs").then(({ writeFileSync, mkdirSync }) => {
  mkdirSync("/tmp/glooko-csvs", { recursive: true });
  for (const { fileName, content } of csvFiles) {
    const safeName = fileName.replace(/\//g, "_");
    writeFileSync(`/tmp/glooko-csvs/${safeName}`, content);
  }
  console.log(`Saved ${csvFiles.length} CSV files to /tmp/glooko-csvs/`);
});
```

**Impact:**
- PHI persisted to filesystem including:
  - Blood glucose readings
  - Insulin doses
  - Carbohydrate intake
  - Medications
  - Exercise logs
- Lambda `/tmp` is reused across invocations - data may persist
- Fire-and-forget async (no error handling)

## Proposed Solutions

### Option A: Gate Behind Debug Flag (Recommended)
Only persist when explicitly enabled.

**Pros:** Keeps debugging capability
**Cons:** Requires manual enablement
**Effort:** Small
**Risk:** Low

```typescript
const DEBUG_PERSIST_CSV = process.env.DEBUG_PERSIST_CSV === 'true';

if (DEBUG_PERSIST_CSV) {
  // ... persist files
}
```

### Option B: Remove File Persistence
Delete all file writing code; process CSVs in memory only.

**Pros:** Eliminates risk
**Cons:** Loses debugging capability
**Effort:** Small
**Risk:** Low

### Option C: Clear /tmp at Lambda Start
Add cleanup at start of each invocation.

**Pros:** Reduces persistence window
**Cons:** Still writes to disk
**Effort:** Small
**Risk:** Medium

## Recommended Action

Option A - Gate behind debug flag + Option C as defense in depth

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/scraper.ts` lines 788-794

## Acceptance Criteria

- [ ] No CSV files written to disk by default
- [ ] Debug mode requires explicit opt-in
- [ ] Lambda clears `/tmp/glooko-*` at start if files exist

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during security review | Health data persistence in Lambda /tmp |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
