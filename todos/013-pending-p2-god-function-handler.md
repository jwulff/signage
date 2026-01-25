---
status: pending
priority: p2
issue_id: "013"
tags: [code-review, architecture, srp, maintainability]
dependencies: ["001"]
---

# God Function: Lambda Handler is 186 Lines with 9 Responsibilities

## Problem Statement

The Lambda handler function in `scraper.ts` is 186 lines and handles 9 distinct concerns, violating the Single Responsibility Principle and making the code difficult to test and maintain.

## Findings

**Location:** `packages/functions/src/glooko/scraper.ts` lines 1187-1373

**Responsibilities Mixed:**
1. Credential retrieval (SST secrets)
2. Browser launching
3. Login flow
4. CSV export
5. CSV parsing
6. Record storage
7. Import metadata
8. Legacy treatment storage
9. Scraper state management

**Impact:**
- Difficult to unit test individual concerns
- Changes to one concern may break others
- Hard to reason about error handling
- No clear separation of concerns

## Proposed Solutions

### Option A: Extract Service Functions (Recommended)
Break handler into focused functions.

**Pros:** Testable, maintainable
**Cons:** More files/functions
**Effort:** Medium
**Risk:** Low

```typescript
// handler.ts - orchestration only
export const handler = async () => {
  const credentials = await getCredentials();
  const scrapeResult = await runScraper(credentials);
  await storeResults(scrapeResult);
  await updateScraperState(scrapeResult);
};

// scraper-orchestrator.ts
export async function runScraper(creds: Credentials): Promise<ScrapeResult> { }

// storage-service.ts
export async function storeResults(result: ScrapeResult): Promise<void> { }
```

### Option B: GlookoImportService Class
Create a class that encapsulates the import workflow.

**Pros:** Object-oriented encapsulation
**Cons:** May be overengineering
**Effort:** Medium
**Risk:** Medium

## Recommended Action

Option A - Extract focused functions

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/scraper.ts` (refactor handler)
- New: `packages/functions/src/glooko/handler.ts`
- New: `packages/functions/src/glooko/scraper-orchestrator.ts`

**Blocked By:** Fix #001 (double browser session) first

## Acceptance Criteria

- [ ] Handler function < 50 lines
- [ ] Each function has single responsibility
- [ ] Individual functions are unit testable
- [ ] All existing tests pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during pattern analysis | God functions indicate design debt |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
- Single Responsibility Principle
