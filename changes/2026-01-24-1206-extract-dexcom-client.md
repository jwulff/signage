# Extract Dexcom Client

*Date: 2026-01-24 1206*

## Why

The Dexcom API logic was duplicated in two places:
- `compositor.ts` (~90 lines for authentication and glucose fetching)
- `widgets/updaters/blood-sugar.ts` (~90 lines of the same code)

This duplication meant bug fixes and API changes needed to happen in two places.

## How

Extracted the shared Dexcom API logic into a new module at `packages/functions/src/dexcom/client.ts`:

- `getSessionId(credentials)` - Two-step Dexcom authentication
- `fetchGlucoseReadings(sessionId, minutes, maxCount)` - Glucose data fetching
- `parseDexcomTimestamp(wt)` - Parse Dexcom's timestamp format
- `DexcomReading`, `DexcomCredentials` types

Updated both consumers to import from the shared module instead of having their own implementations.

## Key Design Decisions

- **Credentials object pattern**: `getSessionId` takes `{ username, password }` instead of separate params for clarity
- **Parameter order standardized**: `fetchGlucoseReadings(sessionId, minutes, maxCount)` matches the API URL order
- **Module-local isStale functions kept**: Both compositor and blood-sugar have their own `isStale()` with slightly different semantics (compositor uses fixed threshold, widget has optional `now` param for testing)

## What's Next

- Phase 3 (optional file reorganization) deferred - current structure works fine
- Can refactor Oura client similarly if duplication appears there
