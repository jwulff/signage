---
status: completed
priority: p1
issue_id: "005"
tags: [code-review, data-integrity, timezone, critical]
dependencies: []
---

# Timezone Ambiguity in Timestamp Parsing (CRITICAL)

## Problem Statement

The `parseTimestamp` function creates dates without explicit timezone handling. This causes timestamps to be interpreted in the server's local timezone rather than the patient's timezone, potentially causing 3+ hour errors in treatment timing data.

## Findings

**Location:** `packages/functions/src/glooko/csv-parser.ts` lines 106-117

**Evidence:**
```typescript
if (glookoFormat) {
  const [, year, month, day, hour, minute] = glookoFormat;
  date = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute)
  );
```

**Impact:**
- `new Date(year, month, day, hour, minute)` uses **server's local timezone**
- Lambda in `us-east-1` interprets "08:00" as Eastern time
- Patient in California (Pacific) sees insulin timed 3 hours early
- **DANGEROUS:** Insulin-on-board calculations become dangerously wrong
- Treatment timing correlation with glucose readings becomes meaningless

**Example:**
- Patient takes insulin at 8:00 AM Pacific (11:00 AM Eastern)
- CSV contains "2026-01-15 08:00"
- Lambda interprets as 8:00 AM Eastern
- Stored timestamp is 3 hours early
- Display shows insulin timing doesn't match meals

## Proposed Solutions

### Option A: Parse as UTC (Recommended if Glooko exports UTC)
Force UTC interpretation for all timestamps.

**Pros:** Consistent, predictable
**Cons:** Need to verify Glooko export format
**Effort:** Small
**Risk:** Low

```typescript
date = new Date(Date.UTC(
  parseInt(year),
  parseInt(month) - 1,
  parseInt(day),
  parseInt(hour),
  parseInt(minute)
));
```

### Option B: Store Original Timezone Offset
Add timezone offset to base record type.

**Pros:** Preserves local context
**Cons:** Requires type changes
**Effort:** Medium
**Risk:** Medium

```typescript
export interface GlookoBaseRecord {
  timestamp: number;
  timezoneOffset?: number;  // minutes from UTC
}
```

### Option C: Use date-fns-tz or similar
Parse with explicit timezone library.

**Pros:** Most robust
**Cons:** Additional dependency
**Effort:** Medium
**Risk:** Low

## Recommended Action

Option A - Parse as UTC (after verifying Glooko export format is UTC)

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/csv-parser.ts` lines 93-139

**Investigation Needed:**
- Determine what timezone Glooko exports in their CSVs
- Check if timezone info is in CSV headers or metadata

## Acceptance Criteria

- [ ] Timestamps parsed with explicit timezone handling
- [ ] Treatment times accurately reflect when events occurred
- [ ] No timezone-related drift in historical data
- [ ] Document timezone assumptions

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during data integrity review | Health data timing is safety-critical |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
