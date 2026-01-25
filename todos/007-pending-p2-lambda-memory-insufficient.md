---
status: pending
priority: p2
issue_id: "007"
tags: [code-review, performance, infrastructure]
dependencies: []
---

# Lambda Memory May Be Insufficient for Puppeteer

## Problem Statement

The Lambda is configured with 1024 MB memory, but Puppeteer with `@sparticuz/chromium` typically requires 1536-2048 MB for stable operation. This may cause intermittent OOM (Out of Memory) errors.

## Findings

**Location:** `infra/widgets.ts` lines 54-62

**Evidence:**
```typescript
export const glookoScraperCron = new sst.aws.Cron("GlookoScraper", {
  schedule: "rate(1 hour)",
  function: {
    handler: "packages/functions/src/glooko/scraper.handler",
    link: [table, glookoEmail, glookoPassword],
    timeout: "120 seconds",
    memory: "1024 MB",  // May be insufficient
  },
});
```

**Impact:**
- Headless Chrome is memory-intensive
- OOM errors during scraping cause data gaps
- With double browser session (see #001), memory pressure doubles
- Page complexity on Glooko dashboard may spike memory

## Proposed Solutions

### Option A: Increase to 2048 MB (Recommended)
Double the memory allocation.

**Pros:** Prevents OOM, allows headroom for complex pages
**Cons:** Marginally higher cost (~$0.001/invocation difference)
**Effort:** Config change
**Risk:** None

```typescript
memory: "2048 MB",
```

### Option B: Monitor and Adjust
Deploy with current settings and monitor CloudWatch metrics.

**Pros:** Data-driven decision
**Cons:** May experience failures first
**Effort:** Requires monitoring setup
**Risk:** Low

## Recommended Action

Option A - Increase to 2048 MB proactively

## Technical Details

**Affected Files:**
- `infra/widgets.ts` line 60

**Cost Analysis:**
- 1024 MB × 120s × 24 invocations/day = 2,880 GB-seconds/day
- 2048 MB × 120s × 24 invocations/day = 5,760 GB-seconds/day
- Additional cost: ~$0.02/day

## Acceptance Criteria

- [ ] Lambda memory increased to 2048 MB
- [ ] No OOM errors in CloudWatch logs
- [ ] Scraper completes reliably

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during performance review | Puppeteer needs 1.5-2GB for stability |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
- @sparticuz/chromium recommendations
