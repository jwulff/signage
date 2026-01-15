/**
 * WebSocket $default handler
 * Handles all incoming messages
 */

import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const body = event.body;

  console.log(`Message from ${connectionId}: ${body}`);

  // TODO: Parse message and handle based on type
  // TODO: Broadcast frame updates to terminals

  return {
    statusCode: 200,
    body: "OK",
  };
};
