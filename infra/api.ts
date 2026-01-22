import { table } from "./storage";

// WebSocket API for terminal connections
// Domain is configured via SIGNAGE_DOMAIN environment variable (e.g., "yourdomain.com")
// If not set, SST will use default AWS URLs
const baseDomain = process.env.SIGNAGE_DOMAIN;

export const api = new sst.aws.ApiGatewayWebSocket("SignageApi", {
  ...(baseDomain && {
    domain:
      $app.stage === "prod"
        ? `ws.signage.${baseDomain}`
        : `ws.${$app.stage}.signage.${baseDomain}`,
  }),
});

// Connection handlers
api.route("$connect", {
  handler: "packages/functions/src/connect.handler",
  link: [table],
});

api.route("$disconnect", {
  handler: "packages/functions/src/disconnect.handler",
  link: [table],
});

api.route("$default", {
  handler: "packages/functions/src/message.handler",
  link: [table, api],
});
