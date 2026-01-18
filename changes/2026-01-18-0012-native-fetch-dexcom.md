# Use Native Fetch for Dexcom API

*Date: 2026-01-18 0012*

## Why
The `dexcom-share-api` npm package had Node.js 20 fetch compatibility issues, causing the error `realFetch.call is not a function` in Lambda. This prevented the blood sugar widget from fetching glucose data.

## How
- Replaced `dexcom-share-api` package with direct native fetch calls to Dexcom Share API
- Implemented two-step authentication flow (get account ID, then session ID)
- Updated tests to mock fetch instead of DexcomClient

## Key Design Decisions
- Native fetch is more reliable and eliminates external dependency issues
- Dexcom Share API endpoints and authentication flow documented in code
- Same data structure and behavior preserved for widget consumers

## What's Next
- Deploy to production and verify blood sugar widget works end-to-end
