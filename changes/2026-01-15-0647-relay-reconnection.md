# Relay Reconnection with Exponential Backoff

*Date: 2026-01-15 0647*

## Why

The relay's WebSocket connection can drop due to network issues or AWS idle timeouts. Without proper reconnection logic, the relay would either reconnect too aggressively (hammering the server) or give up too quickly.

Issue #21 required:
- Exponential backoff to prevent rapid reconnection
- Maximum attempt limit with clean exit
- Logging of all reconnection attempts

## How

Created a reusable `backoff.ts` module with:
- `calculateBackoff()` - Pure function for delay calculation
- `createBackoffController()` - Stateful controller for managing attempts

### Backoff Configuration
- Initial delay: 1 second
- Maximum delay: 30 seconds
- Multiplier: 2x per attempt
- Maximum attempts: 10
- Jitter: ±25% to prevent thundering herd

### Delay Progression
```
Attempt 0: ~1s
Attempt 1: ~2s
Attempt 2: ~4s
Attempt 3: ~8s
Attempt 4: ~16s
Attempt 5+: ~30s (capped)
```

## Key Design Decisions

- **Separate backoff module**: Keeps logic testable and reusable for future WebSocket clients
- **Jitter by default**: Prevents multiple relays from reconnecting simultaneously
- **Controller pattern**: Encapsulates state while keeping `calculateBackoff` pure for testing
- **Reset on success**: Counter resets when connection succeeds, allowing infinite runtime

## What's Next

- Close Issue #21 and Epic #4
- Consider adding health check endpoint for relay monitoring
- Optional: Persist connection state for faster reconnection after relay restart
