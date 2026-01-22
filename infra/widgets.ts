/**
 * Widget infrastructure
 * Cron jobs that trigger widget updates.
 */

import { table } from "./storage";
import { api } from "./api";
import { dexcomUsername, dexcomPassword, ouraClientId, ouraClientSecret } from "./secrets";

// Display compositor - combines all widgets into a single frame
// Updates every minute with clock + blood sugar
export const compositorCron = new sst.aws.Cron("DisplayCompositor", {
  schedule: "rate(1 minute)",
  function: {
    handler: "packages/functions/src/compositor.scheduled",
    link: [table, api, dexcomUsername, dexcomPassword],
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

// Fetch Oura readiness and sleep scores daily at 8 AM Pacific (3 PM UTC)
export const ouraReadinessCron = new sst.aws.Cron("OuraReadinessFetch", {
  schedule: "cron(0 15 * * ? *)",
  function: {
    handler: "packages/functions/src/oura/fetch-readiness.scheduled",
    link: [table, ouraClientId, ouraClientSecret],
    timeout: "120 seconds",
    memory: "256 MB",
  },
});
