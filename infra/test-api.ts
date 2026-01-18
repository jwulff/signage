import { api } from "./api";
import { table } from "./storage";

// HTTP API for test endpoints
export const testApi = new sst.aws.ApiGatewayV2("SignageTestApi", {
  domain:
    $app.stage === "prod"
      ? "api.signage.example.com"
      : `api.${$app.stage}.signage.example.com`,
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
