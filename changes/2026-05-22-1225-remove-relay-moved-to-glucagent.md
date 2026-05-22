# Remove relay + Lightsail deploy (moved to glucagent)

*Date: 2026-05-22 1225*

## Why

The Pixoo relay CLI (`packages/relay/`) and the Lightsail deploy scripts
(`deploy/lightsail/`) have been ported into `jwulff/glucagent` (PR
[glucagent#137](https://github.com/jwulff/glucagent/pull/137), which closes
glucagent#136). Now that they live there, keeping the originals here is
dead weight — every relay change would have to be made in two places and
the diabetes-data wiring is closer to glucagent's natural scope.

This PR removes the duplicated code from signage. The cloud Lambdas,
WebSocket API, and web emulator remain here; only the on-device / cloud-host
relay layer moves.

## How

- `git rm -r packages/relay deploy/lightsail`
- Pruned `vitest.coverage.config.ts` (dropped the now-nonexistent
  `packages/relay/src/**/*.ts` coverage glob).
- Rewrote the README sections that documented the relay so anyone landing
  on signage's README is pointed at glucagent — touched the architecture
  diagram, table of contents, Step 7 (display connection), packages table,
  and the troubleshooting + cost rows. Replaced the long "Relay CLI" and
  "Cloud Relay (Optional)" sections with a single short "Connecting a
  Pixoo display" pointer.
- Left `packages/core/` in place. A `grep` confirmed `@signage/core` is
  still imported across `packages/functions/**`, `packages/local-dev`, and
  the web emulator, so removing it would break the cloud build. The small
  slice the relay needed (`Frame`, `WsMessage`, `FramePayload`,
  `createPixooFrameCommand`, `decodeBase64ToPixels`) is now inlined in
  glucagent's `packages/relay/src/pixoo-protocol.ts`; the duplication is
  intentional and noted in the porting PR there.

## Key Design Decisions

- **Keep `@signage/core`.** It's the shared type/protocol package used by
  every signage Lambda. Removing it is a much bigger separate cleanup; out
  of scope here.
- **Do not touch `packages/functions/src/lightsail/health-check.ts`.** That
  Lambda lives in signage because it's the cloud-side watchdog that reboots
  the Lightsail instance via AWS APIs. It has its own follow-up issue and
  shouldn't ride along with this removal.
- **Branch name `chore/...`.** Signage's CLAUDE.md only allows the
  `feature/`, `fix/`, `chore/`, `docs/` prefixes; `chore/` is the right fit
  for a deletion that ships no new functionality.

## What's Next

- Wait for [glucagent#137](https://github.com/jwulff/glucagent/pull/137) to
  merge before merging this PR. If glucagent#137 is abandoned, this PR
  should also be closed, not merged, so we don't lose the only copy of the
  relay.
- Follow-up issue: clean up the lingering relay references in
  `CLAUDE.md` (package overview, current Pixoo IP, etc.). Out of scope
  here so reviewers can focus on the deletion.
