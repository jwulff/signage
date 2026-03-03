# BG Error Resilience

*Date: 2026-03-02 2010*

## Why

The sign shows "BG ERR" ~24% of the time because Dexcom's auth API intermittently
returns HTTP 500 errors. When this happens, the compositor renders a red "BG ERR"
text instead of the blood sugar reading. Combined with stale WebSocket connections
that accumulate in DynamoDB (some over a month old), the sign frequently gets stuck
showing this error frame.

## How

Two fixes:

1. **BG data caching with fallback**: When Dexcom data is fetched successfully, cache
   it in DynamoDB (`BG_CACHE/LATEST`). When Dexcom fails, fall back to cached data
   with `isStale: true`, which renders the value dimmed/gray instead of showing
   "BG ERR". The sign now always shows a glucose value unless there has never been
   a successful fetch.

2. **Stale connection cleanup**: When `PostToConnectionCommand` throws `GoneException`
   (410), automatically delete the stale connection from DynamoDB. This prevents
   zombie connections from accumulating (found 8 dating back to January 25).

## Key Design Decisions

- Cache is fire-and-forget (void promise) to avoid slowing down the happy path
- Stale BG data shows dimmed/gray via existing `isStale` rendering, not a new UI state
- Cleanup happens inline during broadcast, not as a separate reconciliation step

## What's Next

- Consider adding retry logic for Dexcom auth (single retry on 500)
- The relay's 15-20 minute connection lifespan is a separate issue worth investigating
