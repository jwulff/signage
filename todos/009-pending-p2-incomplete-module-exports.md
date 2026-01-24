---
status: pending
priority: p2
issue_id: "009"
tags: [code-review, architecture, api-design]
dependencies: []
---

# Incomplete Type Exports in index.ts

## Problem Statement

The module's `index.ts` only exports from `types.ts` and `scraper.ts`, omitting exports from `csv-parser.ts`, `data-model.ts`, and `storage.ts`. This makes the public API incomplete.

## Findings

**Location:** `packages/functions/src/glooko/index.ts`

**Evidence:**
```typescript
export * from "./types.js";
export * from "./scraper.js";
// Missing: csv-parser.ts, data-model.ts, storage.ts
```

**Impact:**
- Other modules can't easily import:
  - `GlookoRecord` union type
  - `GlookoStorage` class
  - `parseGlookoExport` function
  - All 12 record type interfaces

## Proposed Solutions

### Option A: Add Explicit Exports (Recommended)
Export specific types and functions that form the public API.

**Pros:** Clear API boundary
**Cons:** Manual maintenance
**Effort:** Small
**Risk:** Low

```typescript
// Public types
export * from "./types.js";
export type { GlookoRecord, GlookoRecordType, TreatmentSummary } from "./data-model.js";
export type { ParseResult, ExtractedCsv } from "./csv-parser.js";

// Public functions
export { scrapeGlooko, launchBrowser, loginToGlooko, exportCsv } from "./scraper.js";
export { parseGlookoExport } from "./csv-parser.js";
export { GlookoStorage, createStorage } from "./storage.js";
```

### Option B: Export Everything
Use `export *` for all modules.

**Pros:** Complete exposure
**Cons:** May expose internal implementation details
**Effort:** Small
**Risk:** Medium

## Recommended Action

Option A - Add explicit exports for public API

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/index.ts`

## Acceptance Criteria

- [ ] All public types and functions exported
- [ ] Internal implementation details not exposed
- [ ] Consumers can import needed items

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during TypeScript review | Module API design requires explicit exports |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
