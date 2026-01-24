---
status: pending
priority: p3
issue_id: "015"
tags: [code-review, reliability, dependencies]
dependencies: []
---

# Manual ZIP Parsing Instead of Library

## Problem Statement

The scraper implements manual ZIP file parsing (~65 lines) instead of using an established library. This is brittle and may fail on edge cases.

## Findings

**Location:** `packages/functions/src/glooko/scraper.ts` lines 55-120

**Evidence:**
```typescript
// Hand-parsing ZIP local file headers
const signature = buffer.readUInt32LE(offset);
if (signature !== 0x04034b50) { break; }
const compressionMethod = buffer.readUInt16LE(offset + 8);
// ... 60+ lines of manual ZIP format handling
```

**Risks:**
- ZIP format has many variants (ZIP64, encrypted, etc.)
- Manual parsing may miss edge cases
- If Glooko changes ZIP settings, scraper breaks

## Proposed Solutions

### Option A: Use adm-zip (Recommended)
Replace manual parsing with established library.

**Pros:** Robust, well-tested
**Cons:** Additional dependency
**Effort:** Small
**Risk:** Low

```typescript
import AdmZip from 'adm-zip';

function extractCsvFilesFromZip(buffer: Buffer): ExtractedCsv[] {
  const zip = new AdmZip(buffer);
  return zip.getEntries()
    .filter(e => e.entryName.endsWith('.csv'))
    .map(e => ({
      fileName: e.entryName,
      content: e.getData().toString()
    }));
}
```

### Option B: Keep Manual Parsing
Document assumptions and add more tests.

**Pros:** No new dependency
**Cons:** Remains fragile
**Effort:** Medium
**Risk:** Medium

## Recommended Action

Option A - Use adm-zip library

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/scraper.ts` lines 55-120
- `packages/functions/package.json` (add adm-zip)

## Acceptance Criteria

- [ ] Replace manual ZIP parsing with library
- [ ] All CSV extraction tests pass
- [ ] ~60 LOC reduction

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during security/reliability review | Use established libraries for file formats |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
- adm-zip: https://github.com/cthackers/adm-zip
