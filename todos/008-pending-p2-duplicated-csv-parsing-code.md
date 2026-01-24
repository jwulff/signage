---
status: pending
priority: p2
issue_id: "008"
tags: [code-review, architecture, dry, maintenance]
dependencies: []
---

# Duplicated CSV Parsing Logic

## Problem Statement

CSV parsing logic is duplicated between `scraper.ts` and `csv-parser.ts`, violating DRY principle and creating maintenance burden.

## Findings

**Location:**
- `packages/functions/src/glooko/scraper.ts` lines 1025-1073 (`parseCSVLine`, `createColumnMap`)
- `packages/functions/src/glooko/csv-parser.ts` lines 48-68 (`parseCsvLine`, `createColumnMap`)

**Evidence:**

Nearly identical implementations:

```typescript
// scraper.ts line 1025-1045
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    // ...
  }
}

// csv-parser.ts line 48-68
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    // ...
  }
}
```

**Duplicated Functions:**
- `parseCSVLine` / `parseCsvLine`
- `parseTimestamp` (both files)
- `findHeaderAndDataStart` (both files)
- `createColumnMap` (both files)

**Impact:**
- ~326 lines of duplication
- Bug fixes must be applied in two places
- Inconsistencies may emerge over time

## Proposed Solutions

### Option A: Extract to csv-utils.ts (Recommended)
Create shared utility module imported by both.

**Pros:** Single source of truth
**Cons:** Additional file
**Effort:** Small
**Risk:** Low

```typescript
// csv-utils.ts
export function parseCsvLine(line: string): string[] { ... }
export function parseTimestamp(value: string): number | null { ... }
export function createColumnMap(header: string[]): Map<string, number> { ... }
```

### Option B: Remove Legacy Parsing from scraper.ts
The `csv-parser.ts` is more comprehensive; remove legacy functions.

**Pros:** Fewer files, cleaner
**Cons:** May affect existing code paths
**Effort:** Medium (refactoring needed)
**Risk:** Medium

## Recommended Action

Option A - Extract to shared csv-utils.ts

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/scraper.ts` (remove duplicates)
- `packages/functions/src/glooko/csv-parser.ts` (keep or extract)
- New: `packages/functions/src/glooko/csv-utils.ts`

## Acceptance Criteria

- [ ] Single implementation of CSV parsing utilities
- [ ] Both files import from shared module
- [ ] All tests pass
- [ ] ~300 LOC reduction

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during pattern analysis | DRY violations compound maintenance |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
