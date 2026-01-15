import { api } from "./api";
import { table } from "./storage";

// HTTP API for test endpoints
export const testApi = new sst.aws.ApiGatewayV2("SignageTestApi", {
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
