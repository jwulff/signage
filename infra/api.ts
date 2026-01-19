import { table } from "./storage";

// WebSocket API for terminal connections
export const api = new sst.aws.ApiGatewayWebSocket("SignageApi", {
  domain:
    $app.stage === "prod"
      ? "ws.signage.wulfffamily.com"
      : `ws.${$app.stage}.signage.wulfffamily.com`,
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
