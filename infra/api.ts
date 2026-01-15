import { table } from "./storage";

// WebSocket API for terminal connections
export const api = new sst.aws.ApiGatewayWebSocket("SignageApi", {
  // TODO: Add routes in Epic 2
  // $connect: "packages/functions/src/connect.handler",
  // $disconnect: "packages/functions/src/disconnect.handler",
  // $default: "packages/functions/src/message.handler",
});

// Grant API access to DynamoDB
// api.route("$connect", {
//   handler: "packages/functions/src/connect.handler",
//   link: [table],
// });
