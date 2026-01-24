# Codebase Hardening

*Date: 2026-01-24 1230*

## Why

The codebase had several areas that could benefit from hardening: incomplete test coverage for renderers, no WebSocket reconnection logic, inefficient DynamoDB scans, missing error handling in the frame composer, and duplicated Oura client code. These improvements increase reliability, performance, and maintainability.

## How

Implemented five targeted improvements:

### 1. Renderer Test Coverage (#101)
Added comprehensive tests for previously untested rendering modules:
- `clock-renderer.test.ts` - 9 tests for time, date, weather band rendering
- `readiness-renderer.test.ts` - 9 tests for Oura score display
- `chart-renderer.test.ts` - 10 tests for blood sugar sparkline
- `frame-composer.test.ts` - 8 tests for composite frame generation

### 2. WebSocket Reconnection Logic (#102)
Enhanced `useWebSocket` hook with production-ready connection handling:
- Exponential backoff: 1s → 2s → 4s... max 30s
- Tab visibility reconnect on focus
- Connection status type: "connected" | "connecting" | "disconnected"
- Visual status indicator in App.tsx (green/yellow/red)

### 3. DynamoDB Query Optimization (#103)
Replaced inefficient Scan operations with targeted Get/Query commands:
- `getCachedWeather`: Scan → GetCommand
- `getOuraUsers`: Scan → GetCommand
- `getOuraUserProfile`: Scan → GetCommand
- `getCachedReadiness`: Scan → GetCommand
- `getCachedSleep`: Scan → GetCommand
- `getActiveConnections`: Scan → QueryCommand (with pk=CONNECTIONS)

### 4. Graceful Degradation in Frame Composer (#104)
Added fault isolation so one widget failure doesn't crash the entire frame:
- `safeRender()` wrapper catches and logs errors per-widget
- Each widget renders independently (clock, readiness, blood sugar)
- Error summary logged when widgets fail
- Tests verify isolation behavior

### 5. Oura Client Extraction (#105)
Consolidated duplicated Oura DynamoDB functions into the dedicated client module:
- Moved `getOuraUsers()` to `oura/client.ts`
- Moved `getOuraUserProfile()` to `oura/client.ts`
- Reused existing `getCachedReadiness()` and `getCachedSleep()`
- Removed ~85 lines of duplicate code from compositor.ts

## Key Design Decisions

- **Exponential backoff** chosen over fixed interval for reconnection to avoid server flooding
- **Tab visibility API** used for immediate reconnect on focus - better UX than waiting for backoff
- **Connection key pattern** changed from `pk=CONNECTION#${id}` to `pk=CONNECTIONS, sk=id` to enable efficient Query
- **safeRender wrapper** logs but doesn't throw, allowing partial frame rendering
- **Oura client** follows same pattern as Dexcom client for consistency

## What's Next

- Consider adding connection state persistence across page refreshes
- Add integration tests for the full rendering pipeline
- Monitor DynamoDB consumed capacity to validate Query optimization
