---
status: pending
priority: p3
issue_id: "016"
tags: [code-review, testing, quality]
dependencies: []
---

# Missing Tests for Storage Layer

## Problem Statement

The `storage.ts` file (417 lines) has no unit tests despite containing critical deduplication and query logic.

## Findings

**Location:** `packages/functions/src/glooko/storage.ts`

**Untested Logic:**
- `generateRecordHash()` - 12 record type hash generation
- `buildItem()` - DynamoDB item construction
- `storeRecords()` - Batch deduplication with conditional writes
- `queryByTypeAndTimeRange()` - Time range queries
- `getTreatmentSummary()` - Treatment aggregation

**Impact:**
- Deduplication bugs could cause data loss
- Hash generation errors could create duplicates
- Query logic errors would return wrong data

## Proposed Solutions

### Option A: Add Unit Tests (Recommended)
Create comprehensive test suite for storage.

**Pros:** Confidence in critical code
**Cons:** Testing effort
**Effort:** Medium
**Risk:** Low

```typescript
// storage.test.ts
describe('generateRecordHash', () => {
  it('produces consistent hashes for same input', () => { });
  it('produces different hashes for different inputs', () => { });
});

describe('storeRecords', () => {
  it('writes new records', () => { });
  it('detects duplicates via conditional check', () => { });
});
```

## Recommended Action

Add comprehensive unit tests

## Technical Details

**New Files:**
- `packages/functions/src/glooko/storage.test.ts`

**Testing Strategy:**
- Mock DynamoDB client
- Test hash generation for all 12 record types
- Test deduplication scenarios
- Test query boundary conditions

## Acceptance Criteria

- [ ] Hash generation tests for all record types
- [ ] Deduplication scenario tests
- [ ] Query range boundary tests
- [ ] >80% coverage on storage.ts

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during TypeScript review | Critical code paths need test coverage |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
