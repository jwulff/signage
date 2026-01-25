---
status: pending
priority: p3
issue_id: "017"
tags: [code-review, naming, consistency]
dependencies: []
---

# Inconsistent Naming: *Reading vs *Record Types

## Problem Statement

Record type names are inconsistent - some use `*Reading` suffix, others use `*Record` suffix.

## Findings

**Location:** `packages/functions/src/glooko/data-model.ts`

**Inconsistency:**
```typescript
interface CgmReading { ... }      // No "Record" suffix
interface BgReading { ... }       // No "Record" suffix
interface BolusRecord { ... }     // Has "Record" suffix
interface BasalRecord { ... }     // Has "Record" suffix
interface CarbsRecord { ... }     // Has "Record" suffix
```

**Impact:**
- Cognitive overhead when working with types
- Inconsistent API surface
- May indicate rushed design decisions

## Proposed Solutions

### Option A: Standardize on *Record (Recommended)
Rename all to consistent suffix.

**Pros:** Consistent naming
**Cons:** Breaking change for any consumers
**Effort:** Small
**Risk:** Low (no external consumers yet)

```typescript
interface CgmRecord { ... }
interface BgRecord { ... }
```

### Option B: Keep as Is
Document the inconsistency.

**Pros:** No changes
**Cons:** Remains inconsistent
**Effort:** None
**Risk:** None

## Recommended Action

Option A - Standardize on *Record suffix

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/data-model.ts`
- Any imports of `CgmReading` or `BgReading`

## Acceptance Criteria

- [ ] All record types use consistent suffix
- [ ] TypeScript compile succeeds
- [ ] All tests pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during pattern analysis | Naming consistency aids maintainability |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
