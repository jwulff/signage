---
status: pending
priority: p3
issue_id: "014"
tags: [code-review, logging, observability]
dependencies: []
---

# Excessive Console Logging (60+ Statements)

## Problem Statement

The scraper has 60+ `console.log/warn/error` statements creating noise in production CloudWatch logs without structured logging or log levels.

## Findings

**Locations:** Spread across `scraper.ts`, `csv-parser.ts`, `storage.ts`

**Examples:**
```typescript
console.log("Navigating to Glooko login page...");
console.log(`Found email input with selector: ${selector}`);
console.log(`Extracted ${fileName}: ${csvContent.length} bytes`);
console.log(`Parsed ${parsed.length} ${fileType} records from ${fileName}`);
```

**Impact:**
- CloudWatch log costs increase
- Important messages buried in noise
- No log level filtering in production
- Inconsistent log format

## Proposed Solutions

### Option A: Implement Log Levels (Recommended)
Use environment-based log levels.

**Pros:** Configurable verbosity
**Cons:** Requires wrapper
**Effort:** Small
**Risk:** Low

```typescript
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const log = {
  debug: (msg: string) => LOG_LEVEL === 'debug' && console.log(msg),
  info: (msg: string) => ['debug', 'info'].includes(LOG_LEVEL) && console.log(msg),
  warn: (msg: string) => console.warn(msg),
  error: (msg: string) => console.error(msg),
};
```

### Option B: Remove Non-Essential Logs
Keep only error/warn logs.

**Pros:** Simple
**Cons:** Loses debugging context
**Effort:** Medium
**Risk:** Low

## Recommended Action

Option A - Implement log levels

## Technical Details

**Affected Files:**
- `packages/functions/src/glooko/scraper.ts`
- `packages/functions/src/glooko/csv-parser.ts`

## Acceptance Criteria

- [ ] Log wrapper with configurable levels
- [ ] Production defaults to 'info' level
- [ ] Debug logs available via env var

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during pattern analysis | Logging strategy needed for production |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
