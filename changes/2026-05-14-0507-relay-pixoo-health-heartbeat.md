# Relay: Pixoo Health Heartbeat to Glucagent

*Date: 2026-05-14 0507 UTC*

## Why

When the Pixoo's HTTP daemon hangs (a known Divoom firmware quirk — device pings but port 80 dies), the display goes dark and the only signal is `journalctl` on the Lightsail relay. The cloud side (`glucagent#130` / `glucagent#131`) builds the monitoring + email path; this change is the relay-side half — it writes per-frame health heartbeats into glucagent's DynamoDB so the monitor has something to read.

Diagnosed manually on 2026-05-13 when the Pixoo hung at 00:14 PT (~6 minutes of failed frames before I noticed the dark display).

## How

1. **New module: `packages/relay/src/heartbeat.ts`** — `createHeartbeat({deviceId, tableName, region})` returns a `HealthHeartbeat` with `reportSuccess()` and `reportFailure(reason)`. Both write to `DEVICE_HEALTH#<deviceId>` / `STATE` using `UpdateItemCommand`. Errors are caught and logged but never thrown — the heartbeat path must never break the frame path.
2. **Wired into `relay.ts`** — the existing `await sendFrameToPixoo(...)` call is now wrapped in try/catch; on success we call `heartbeat.reportSuccess()`, on failure we extract the inner undici/fetch error code (`UND_ERR_CONNECT_TIMEOUT` etc.) and call `heartbeat.reportFailure(code)`. The original error continues to propagate so existing logging is unchanged.
3. **Configured via `cli.ts`** — three env vars (`PIXOO_DEVICE_ID`, `GLUCAGENT_RECORDS_TABLE`, `GLUCAGENT_REGION`) plus the standard AWS credential chain (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`). If any of the three are unset, heartbeats are disabled (noop) so local-dev runs don't need creds.
4. **Updated `deploy/lightsail/setup.sh`** so fresh installs get a commented template of the new env vars; existing `/etc/signage-relay.env` files on running Lightsail boxes need manual edits + a `systemctl restart signage-relay.service`.

## Cross-repo wiring

The IAM user (`signage-relay-heartbeat`) and policy are provisioned in `jwulff/glucagent#131` — a least-privilege policy scoped to `dynamodb:UpdateItem` on the Records table, constrained to `DEVICE_HEALTH#*` leading keys. Access key ID + secret are emitted as SST outputs on first apply; copy them into `/etc/signage-relay.env` on the Lightsail box.

## Test Plan

- [x] `heartbeat.test.ts` — 6 tests (success path command shape, failure path command shape, empty reason → "unknown", DDB rejection on both paths)
- [x] `relay.test.ts` — 3 new tests (heartbeat.reportSuccess called on frame send, reportFailure called with the cause code on failure, default noop heartbeat works)
- [x] Full repo suite green: 547 tests across all packages (core 7, diabetes 34, web 45, relay 37, functions 424)
- [x] Lint clean (0 errors)
- [ ] After deploy: confirm `[heartbeat] enabled` log line on relay startup
- [ ] After deploy + glucagent#131 deploy: confirm a `DEVICE_HEALTH#pixoo-home` row appears in the glucagent Records table and gets updated every ~60s

## Deploy Steps

1. Wait for `jwulff/glucagent#131` to merge and GH-Actions-deploy (creates IAM user + access key, sets up monitor cron).
2. Retrieve the relay's AWS access key from the glucagent SST outputs.
3. SSH to `ubuntu@signage-relay`, edit `/etc/signage-relay.env` to add the four new lines (device id, table name, region, AWS creds).
4. `sudo systemctl restart signage-relay`.
5. Confirm `[heartbeat] enabled` appears in `sudo journalctl -u signage-relay -f`.

## What's Next

- End-to-end verification: unplug the Pixoo for ≥5 min, confirm alert email arrives, plug it back in, confirm recovery email arrives.
