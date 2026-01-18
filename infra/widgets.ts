/**
 * Widget infrastructure
 * Cron jobs that trigger widget updates.
 */

import { table } from "./storage";
import { api } from "./api";
import { dexcomUsername, dexcomPassword } from "./secrets";

// Clock widget - updates every minute
export const clockCron = new sst.aws.Cron("ClockWidget", {
  schedule: "rate(1 minute)",
  function: {
    handler: "packages/functions/src/clock.scheduled",
    link: [table, api],
    environment: {
      WEBSOCKET_URL: api.url,
    },
    timeout: "30 seconds",
    memory: "256 MB",
  },
});

// Run connection counter reconciliation hourly
export const reconcileCron = new sst.aws.Cron("ConnectionReconcile", {
  schedule: "rate(1 hour)",
  function: {
    handler: "packages/functions/src/widgets/reconcile.handler",
    link: [table],
    timeout: "60 seconds",
    memory: "256 MB",
  },
});

// Blood sugar widget - updates every minute
export const bloodSugarCron = new sst.aws.Cron("BloodsugarWidget", {
  schedule: "rate(1 minute)",
  function: {
    handler: "packages/functions/src/widgets/dispatcher.handler",
    link: [table, api, dexcomUsername, dexcomPassword],
    timeout: "30 seconds",
    memory: "256 MB",
  },
});
