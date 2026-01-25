---
status: completed
priority: p1
issue_id: "001"
tags: [code-review, performance, architecture]
dependencies: []
---

# Double Browser Session in Lambda Handler

## Problem Statement

The Lambda handler function launches TWO separate browser sessions to accomplish what should be a single scrape operation. This doubles execution time, memory usage, and Glooko login frequency.

## Findings

**Location:** `packages/functions/src/glooko/scraper.ts` lines 1206-1339

**Evidence:**
```typescript
// Line 1206: First browser session via scrapeGlooko()
const result = await scrapeGlooko({ email, password, exportDays: 14 });

// Line 1229-1239: SECOND browser session for raw CSVs
browser = await launchBrowser();
const page = await browser.newPage();
await loginToGlooko(page, email, password);
const csvFiles = await exportCsv(page, 14);
```

**Impact:**
- Doubles Lambda execution time (~60-90s becomes ~120-180s)
- Doubles memory usage during overlap
- Doubles network requests to Glooko (login twice, export twice)
- Risk of rate limiting from Glooko
- Wastes Lambda compute costs

## Proposed Solutions

### Option A: Return CSV Files from scrapeGlooko() (Recommended)
Modify `scrapeGlooko()` to return both parsed treatments AND raw CSV files.

**Pros:** Minimal refactoring, preserves backward compatibility
**Cons:** Changes return type
**Effort:** Small
**Risk:** Low

```typescript
interface ScraperResultWithCsv extends GlookoScraperResult {
  csvFiles?: ExtractedCsv[];
}

export async function scrapeGlooko(config: GlookoScraperConfig): Promise<ScraperResultWithCsv> {
  // ... existing code but also return csvFiles
  return { success: true, treatments, csvFiles, scrapedAt: Date.now() };
}
```

### Option B: Extract Common Browser Session
Create a `GlookoSession` class that manages the browser lifecycle and exposes both legacy and new data extraction methods.

**Pros:** Cleaner architecture
**Cons:** Larger refactor
**Effort:** Medium
**Risk:** Medium

## Recommended Action

Option A - Modify `scrapeGlooko()` return type

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/scraper.ts` (handler function + scrapeGlooko function)

**Components:** Glooko scraper Lambda

## Acceptance Criteria

- [ ] Single browser session per Lambda invocation
- [ ] Both legacy treatments AND raw CSV data extracted in one session
- [ ] Execution time reduced by ~50%
- [ ] All existing tests pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during code review | Discovered via performance-oracle and architecture-strategist agents |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
- Related: Lambda memory allocation (1024MB may be insufficient with double sessions)
