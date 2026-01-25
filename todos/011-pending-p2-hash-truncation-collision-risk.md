---
status: pending
priority: p2
issue_id: "011"
tags: [code-review, data-integrity, hashing]
dependencies: []
---

# Hash Truncation Creates Collision Risk

## Problem Statement

The deduplication hash is truncated to 12 characters (48 bits), creating non-negligible collision risk for large datasets. A patient with 20+ years of CGM data could experience silent data loss from hash collisions.

## Findings

**Location:** `packages/functions/src/glooko/storage.ts` lines 109-110

**Evidence:**
```typescript
return createHash("sha256").update(hashInput).digest("hex").substring(0, 12);
```

**Analysis:**
- 12-character hex = 48 bits of entropy
- SHA-256 is 256 bits, but truncation reduces to 48 bits
- Birthday problem: For ~2 million records (20 years CGM), collision probability becomes concerning
- 1-in-281-trillion per pair, but scales non-linearly with record count

**Impact:**
- Record with identical hash is silently dropped as "duplicate"
- Patient's historical data becomes incomplete
- No indication of collision - appears successful

## Proposed Solutions

### Option A: Increase Hash Length (Recommended)
Use 16-24 characters instead of 12.

**Pros:** Simple fix, dramatically reduces collision risk
**Cons:** Slightly longer sort keys
**Effort:** Small
**Risk:** Low

```typescript
return createHash("sha256").update(hashInput).digest("hex").substring(0, 16);
```

### Option B: Use Full Hash
Don't truncate at all.

**Pros:** Maximum uniqueness
**Cons:** Longer sort keys (64 chars)
**Effort:** Small
**Risk:** Low

## Recommended Action

Option A - Increase to 16 characters (64 bits)

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/storage.ts` line 110

**Storage Impact:**
- 16 chars vs 12 chars = 4 additional bytes per record
- For 100K records: 400KB additional storage
- Negligible cost impact

## Acceptance Criteria

- [ ] Hash length increased to 16+ characters
- [ ] Existing data migration considered (or accepted as minor incompatibility)
- [ ] Collision probability documented

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during data integrity review | Birthday paradox affects deduplication |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
- Birthday Problem Calculator
