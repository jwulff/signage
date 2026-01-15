/**
 * WebSocket $disconnect handler
 * Called when a client disconnects
 */

import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  console.log(`Client disconnected: ${connectionId}`);

  // TODO: Remove connection from DynamoDB

  return {
    statusCode: 200,
    body: "Disconnected",
  };
};
