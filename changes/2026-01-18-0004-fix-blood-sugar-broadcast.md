# Fix Blood Sugar Widget Broadcast

*Date: 2026-01-18 0004*

## Why
The blood sugar widget was successfully fetching Dexcom glucose data but failing to broadcast to connected clients. The error was `getaddrinfo ENOTFOUND https` - the API Gateway management endpoint URL was malformed because `https://` was being prepended to a URL that already included the protocol.

## How
- Removed the redundant `https://` prefix from the management endpoint URL construction
- Added fallback widget ID extraction from Lambda function name when EventBridge rule name is unavailable

## Key Design Decisions
- SST's `managementEndpoint` property already returns a complete URL including the protocol
- Widget ID extraction now has two methods: EventBridge rule name (primary) and Lambda function name (fallback)

## What's Next
- Deploy to production and verify blood sugar data is broadcasting to connected terminals
