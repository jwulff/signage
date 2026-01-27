---
title: "refactor: Extract Dexcom Client"
type: refactor
date: 2026-01-24
---

# refactor: Extract Dexcom Client

## Overview

Extract duplicated Dexcom API logic from `compositor.ts` into a shared module. Optionally reorganize widget files into co-located folders.

## Problem Statement

The compositor (~680 lines) contains ~150 lines of Dexcom API logic that duplicates code in `widgets/updaters/blood-sugar.ts`. Both files implement:

- Session authentication
- Glucose reading fetches
- Timestamp parsing
- Response type handling

This duplication means bug fixes and API changes need to happen in two places.

## Proposed Solution

Extract the shared Dexcom API logic into a single module. Import it where needed.

## Technical Approach

### New Dexcom Client Module

```typescript
// packages/functions/src/dexcom/client.ts
export interface DexcomCredentials {
  username: string;
  password: string;
}

export interface DexcomReading {
  WT: string;       // Weird timestamp format
  ST: string;       // System time
  DT: string;       // Display time
  Value: number;
  Trend: number;
}

export async function getSessionId(credentials: DexcomCredentials): Promise<string> {
  // Authentication logic (currently in compositor.ts lines 47-91)
}

export async function fetchGlucoseReadings(
  sessionId: string,
  minutes: number,
  maxCount: number
): Promise<DexcomReading[]> {
  // Fetch logic (currently in compositor.ts lines 93-130)
}

export function parseDexcomTimestamp(timestamp: string): Date {
  // Parse WT format (currently in compositor.ts lines 132-145)
}
```

### Updated Compositor

```typescript
// compositor.ts (simplified)
import { getSessionId, fetchGlucoseReadings, parseDexcomTimestamp } from './dexcom/client';

// Remove ~150 lines of duplicated Dexcom logic
// Keep: frame composition, WebSocket broadcast, weather fetch
```

### Updated Blood Sugar Updater

```typescript
// widgets/updaters/blood-sugar.ts (simplified)
import { getSessionId, fetchGlucoseReadings, parseDexcomTimestamp } from '../../dexcom/client';

// Remove duplicated functions
// Keep: WidgetUpdater interface, history logic, data transformation
```

## Implementation Phases

### Phase 1: Extract Dexcom Client

- [x] Create `packages/functions/src/dexcom/client.ts`
- [x] Move authentication logic from compositor
- [x] Move glucose fetch logic from compositor
- [x] Move timestamp parsing from compositor
- [x] Add types for credentials, readings, responses
- [x] Write tests for the new module

**Files:**
- `packages/functions/src/dexcom/client.ts` (new)
- `packages/functions/src/dexcom/__tests__/client.test.ts` (new)

### Phase 2: Update Consumers

- [x] Update `compositor.ts` to import from dexcom/client
- [x] Delete duplicated functions from compositor (~90 lines)
- [x] Update `widgets/updaters/blood-sugar.ts` to import from dexcom/client
- [x] Delete duplicated functions from blood-sugar updater (~90 lines)
- [x] Verify all tests pass (103 tests)

**Files:**
- `packages/functions/src/compositor.ts` (simplified)
- `packages/functions/src/widgets/updaters/blood-sugar.ts` (simplified)

### Phase 3: Optional File Reorganization

If co-located files would help navigation, move updaters and renderers together:

- [ ] Move `widgets/updaters/clock.ts` → `widgets/clock/updater.ts`
- [ ] Move `rendering/clock-renderer.ts` → `widgets/clock/renderer.ts`
- [ ] Same for blood-sugar and oura
- [ ] Update imports
- [ ] Keep the existing manual registry (explicit is good)

**This phase is optional.** The current file locations work fine. Only reorganize if the team finds navigation painful.

## Acceptance Criteria

### Functional Requirements

- [ ] Dexcom API logic exists in exactly one place
- [ ] Compositor continues to work identically
- [ ] Blood sugar widget continues to work identically
- [ ] All existing tests pass

### Quality Gates

- [ ] New dexcom/client.ts has >90% test coverage
- [ ] No regressions in frame rendering
- [ ] TypeScript strict mode passes

## What We're NOT Doing

Based on review feedback, this plan explicitly avoids:

- **No WidgetDefinition interface** - 4 widgets don't need a generic contract
- **No auto-discovery registry** - Explicit imports are clearer
- **No signage.config.ts** - Layout is fine in frame-composer.ts
- **No WidgetContext abstraction** - Just import what you need
- **No infrastructure generation** - 44 lines of explicit crons are fine
- **No OAuth route generation** - Only Oura needs OAuth, keep it separate

## Estimated Scope

| Phase | LOC Changed | LOC Removed |
|-------|-------------|-------------|
| Phase 1: Extract client | +200 | 0 |
| Phase 2: Update consumers | +10 | -150 |
| Phase 3: Reorganize (optional) | ±100 | 0 |
| **Net** | **+60** | **-150** |

Net reduction: ~90 lines (deduplication wins).

## References

- Brainstorm: `docs/brainstorms/2026-01-24-widget-module-architecture-brainstorm.md`
- Compositor: `packages/functions/src/compositor.ts`
- Blood sugar updater: `packages/functions/src/widgets/updaters/blood-sugar.ts`
