---
status: completed
priority: p1
issue_id: "006"
tags: [code-review, data-integrity, validation, medical]
dependencies: []
---

# No Range Validation for Medical Values (CRITICAL)

## Problem Statement

The CSV parser accepts any numeric value without validating physiological plausibility. Glucose values outside 20-600 mg/dL are impossible; insulin doses over 100 units are almost certainly data errors. Invalid data could corrupt historical records and affect treatment decisions.

## Findings

**Location:** `packages/functions/src/glooko/csv-parser.ts` lines 208-211

**Evidence:**
```typescript
const glucose = parseFloat0(
  getColumn(row, colMap, "cgmglucosevaluemgdl", "glucosevalue", "glucose")
);
if (glucose <= 0) continue;  // Only checks for zero/negative
```

**Impact:**
- Invalid data accepted and stored:
  - Glucose "12045" instead of "120.45" (decimal placement error)
  - Insulin "500" instead of "5.00" (unit error)
- Downstream effects:
  - Chart rendering breaks with outliers
  - Treatment summaries become meaningless
  - Historical analytics corrupted
  - **Dangerous:** Treatment recommendations based on bad data

## Proposed Solutions

### Option A: Add Validation Constants (Recommended)
Define physiological limits and validate at parse time.

**Pros:** Simple, catches errors early
**Cons:** May reject valid edge cases
**Effort:** Small
**Risk:** Low

```typescript
const GLUCOSE_MIN = 20;    // mg/dL - below this is device error
const GLUCOSE_MAX = 600;   // mg/dL - above this is device error
const INSULIN_MAX_BOLUS = 100;  // units - above this is data error
const CARBS_MAX = 500;     // grams - above this is data error

function validateGlucose(value: number): boolean {
  return value >= GLUCOSE_MIN && value <= GLUCOSE_MAX;
}

// In parser:
const glucose = parseFloat0(...);
if (!validateGlucose(glucose)) {
  errors.push(`Invalid glucose value ${glucose} at row ${i}`);
  continue;
}
```

### Option B: Soft Validation with Warnings
Accept all values but flag suspicious ones.

**Pros:** Doesn't lose potentially valid data
**Cons:** Still stores bad data
**Effort:** Small
**Risk:** Medium

## Recommended Action

Option A - Add strict validation for medical values

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/csv-parser.ts`

**Validation Rules:**
| Field | Min | Max | Notes |
|-------|-----|-----|-------|
| Glucose (mg/dL) | 20 | 600 | Standard CGM range |
| Insulin bolus (units) | 0 | 100 | Max typical dose ~50u |
| Carbs (grams) | 0 | 500 | Max realistic meal |
| Basal rate (u/hr) | 0 | 10 | Max typical rate ~5u/hr |

## Acceptance Criteria

- [ ] Validation constants defined with documentation
- [ ] Invalid values rejected at parse time
- [ ] Error count reported in parse results
- [ ] Tests added for boundary conditions

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during data integrity review | Medical data requires domain validation |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
- Dexcom CGM range: 40-400 mg/dL
- Standard insulin pump max bolus: 25-50 units
