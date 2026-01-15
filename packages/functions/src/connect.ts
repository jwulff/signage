/**
 * WebSocket $connect handler
 * Called when a client establishes a WebSocket connection
 */

import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  console.log(`Client connected: ${connectionId}`);

  // TODO: Store connection in DynamoDB
  // TODO: Associate with terminal if specified in query params

  return {
    statusCode: 200,
    body: "Connected",
  };
};
