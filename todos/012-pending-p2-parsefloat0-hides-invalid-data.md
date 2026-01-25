---
status: pending
priority: p2
issue_id: "012"
tags: [code-review, data-integrity, error-handling]
dependencies: []
---

# parseFloat0 Silently Converts Invalid Data to Zero

## Problem Statement

The `parseFloat0` utility converts invalid numeric strings to zero, conflating "unknown value" with "zero value". For medical data, this is dangerous - zero insulin is meaningful, not the same as missing insulin.

## Findings

**Location:** `packages/functions/src/glooko/csv-parser.ts` lines 144-147

**Evidence:**
```typescript
function parseFloat0(value: string): number {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}
```

**Usage:**
```typescript
const glucose = parseFloat0(getColumn(row, colMap, "glucose"));
// If "glucose" column contains "N/A", glucose = 0 (wrong!)
```

**Impact:**
- CSV field "N/A" → stored as 0
- Missing field → stored as 0
- Malformed number → stored as 0
- System thinks patient received zero insulin when actually value is unknown
- Treatment history becomes unreliable

## Proposed Solutions

### Option A: Return null for Invalid Values (Recommended)
Let callers decide how to handle missing data.

**Pros:** Explicit handling, no silent data loss
**Cons:** Requires caller updates
**Effort:** Small
**Risk:** Medium

```typescript
function parseFloatOrNull(value: string): number | null {
  if (!value || value.trim() === '') return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}
```

### Option B: Rename to parseFloatOrZero
Keep behavior but make it explicit.

**Pros:** Documents intent
**Cons:** Doesn't fix the underlying issue
**Effort:** Small
**Risk:** Low

## Recommended Action

Option A - Return null for invalid values

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/csv-parser.ts` lines 144-147
- All callers of `parseFloat0`

## Acceptance Criteria

- [ ] Invalid values return null, not zero
- [ ] Callers explicitly handle null case
- [ ] Tests cover invalid input scenarios

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during data integrity review | Zero vs null distinction matters for medical data |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
