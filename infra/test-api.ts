import { api } from "./api";
import { table } from "./storage";
import { ouraClientId, ouraClientSecret } from "./secrets";

// HTTP API for test endpoints
// Domain is configured via SIGNAGE_DOMAIN environment variable
const baseDomain = process.env.SIGNAGE_DOMAIN;

export const testApi = new sst.aws.ApiGatewayV2("SignageTestApi", {
  ...(baseDomain && {
    domain:
      $app.stage === "prod"
        ? `api.signage.${baseDomain}`
        : `api.${$app.stage}.signage.${baseDomain}`,
  }),
  cors: {
    allowOrigins: ["*"],
    allowMethods: ["GET", "POST"],
  },
});

// Test bitmap endpoint
testApi.route("GET /test-bitmap", {
  handler: "packages/functions/src/test-bitmap.handler",
  link: [table, api],
  environment: {
    WEBSOCKET_URL: api.url,
  },
});

// Health check
testApi.route("GET /health", {
  handler: "packages/functions/src/health.handler",
});

// News digest endpoint - AI-powered news with web grounding
testApi.route("GET /news-digest", {
  handler: "packages/functions/src/news-digest.handler",
  link: [table, api],
  environment: {
    WEBSOCKET_URL: api.url,
  },
  permissions: [
    {
      actions: ["bedrock:InvokeModel"],
      resources: [
        "arn:aws:bedrock:*::foundation-model/*",
        "arn:aws:bedrock:*:*:inference-profile/*",
      ],
    },
  ],
  timeout: "30 seconds", // Allow time for Bedrock + cycling through headlines
});

// Clock widget endpoint - displays current time
testApi.route("GET /clock", {
  handler: "packages/functions/src/clock.handler",
  link: [table, api],
  environment: {
    WEBSOCKET_URL: api.url,
  },
  timeout: "30 seconds",
});

// Oura OAuth - Start authorization flow
testApi.route("GET /oura/auth/start", {
  handler: "packages/functions/src/oura/oauth-start.handler",
  link: [table, ouraClientId, ouraClientSecret],
  timeout: "10 seconds",
});

// Oura OAuth - Handle callback
testApi.route("GET /oura/auth/callback", {
  handler: "packages/functions/src/oura/oauth-callback.handler",
  link: [table, ouraClientId, ouraClientSecret],
  timeout: "30 seconds",
});
