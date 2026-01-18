# Relay Connection Fixes

*Date: 2026-01-17 2151*

## Why

The relay was failing to establish WebSocket connections to AWS API Gateway due to two issues:

1. **ALPN Protocol Negotiation**: AWS API Gateway's HTTPS endpoint was negotiating HTTP/2 via ALPN, but WebSocket requires HTTP/1.1. This caused connection failures.

2. **ESM Import Extensions**: The relay's ESM imports were missing `.js` extensions, causing module resolution failures in the compiled JavaScript.

## How

### HTTP/1.1 Fix

Added an HTTPS agent that explicitly requests HTTP/1.1 via ALPN:

```typescript
const agent = new https.Agent({
  ALPNProtocols: ["http/1.1"],
});

const ws = new WebSocket(wsUrl, { agent });
```

### ESM Extensions Fix

Added `.js` extensions to all relative imports in the relay package:

```typescript
// Before
import { sendFrameToPixoo } from "./pixoo-client";

// After
import { sendFrameToPixoo } from "./pixoo-client.js";
```

## Key Design Decisions

- **Agent-based solution**: Rather than modifying global Node.js settings, we scope the HTTP/1.1 requirement to just the WebSocket connection via the `agent` option.
- **Explicit extensions**: ESM in Node.js requires explicit file extensions for relative imports, unlike CommonJS which auto-resolves.

## What's Next

- Monitor connection stability in production
- Consider adding connection health metrics
