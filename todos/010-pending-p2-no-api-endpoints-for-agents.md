---
status: pending
priority: p2
issue_id: "010"
tags: [code-review, agent-native, api, architecture]
dependencies: []
---

# No API Endpoints for Agent Access (Agent-Native Architecture Gap)

## Problem Statement

The Glooko integration has zero HTTP endpoints exposed. An agent cannot trigger a data refresh, query treatment data, or check scraper status. All data collection is cron-driven with no programmatic access.

## Findings

**Agent Capability Assessment:**

| Action | Agent Accessible? | Location |
|--------|-------------------|----------|
| Trigger data refresh | NO | Cron only (infra/widgets.ts) |
| Query treatment data | NO | Internal Lambda only (storage.ts) |
| Get treatment totals | NO | Internal Lambda only |
| Query by time range | NO | Internal Lambda only |
| Check scraper status | NO | DynamoDB only |
| View import history | NO | Internal Lambda only |

**Impact:**
- Agent cannot answer "How much insulin did I take today?"
- Agent cannot request "Refresh my treatment data now"
- Agent cannot check "Is the scraper working?"
- Feature is invisible to agent-based workflows

**Comparison:** Oura integration has `/oura/auth/start` and `/oura/auth/callback` - Glooko has nothing.

## Proposed Solutions

### Option A: Add HTTP API Layer (Recommended)
Create REST endpoints for Glooko data access.

**Pros:** Full agent accessibility
**Cons:** Requires new endpoints
**Effort:** Medium
**Risk:** Low

**Endpoints:**
```typescript
// infra/test-api.ts
testApi.route("GET /glooko/treatments", { handler: "..." });  // Treatment summary
testApi.route("GET /glooko/status", { handler: "..." });      // Scraper status
testApi.route("POST /glooko/refresh", { handler: "..." });    // Trigger refresh
testApi.route("GET /glooko/records", { handler: "..." });     // Query by type/time
```

### Option B: WebSocket Messages
Expose via existing WebSocket API.

**Pros:** Uses existing infrastructure
**Cons:** More complex for agents
**Effort:** Medium
**Risk:** Medium

## Recommended Action

Option A - Add HTTP API layer with REST endpoints

## Technical Details

**New Files Needed:**
- `packages/functions/src/glooko/api.ts` - HTTP handlers

**Affected Files:**
- `infra/test-api.ts` - Add route definitions

**GlookoStorage Methods Available:**
- `queryByTypeAndTimeRange()` - Ready to expose
- `getTreatmentSummary()` - Ready to expose
- `getRecentImports()` - Ready to expose

## Acceptance Criteria

- [ ] `GET /glooko/treatments` returns treatment summary JSON
- [ ] `GET /glooko/status` returns scraper status
- [ ] `POST /glooko/refresh` triggers manual scrape
- [ ] Agents can query treatment data programmatically

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-24 | Identified during agent-native review | Feature parity between UI and agent access |

## Resources

- PR #107: https://github.com/jwulff/signage/pull/107
- Agent-Native Architecture principles
