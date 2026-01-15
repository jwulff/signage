/**
 * WebSocket $default handler
 * Handles all incoming messages
 */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

interface WsMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const { domainName, stage } = event.requestContext;
  const body = event.body;

  console.log(`Message from ${connectionId}: ${body}`);

  if (!body) {
    return { statusCode: 400, body: "Empty message" };
  }

  let message: WsMessage;
  try {
    message = JSON.parse(body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  // Handle ping/pong
  if (message.type === "ping") {
    const apiClient = new ApiGatewayManagementApiClient({
      endpoint: `https://${domainName}/${stage}`,
    });

    await apiClient.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify({
          type: "pong",
          payload: {},
          timestamp: Date.now(),
        }),
      })
    );

    return { statusCode: 200, body: "pong" };
  }

  // Handle broadcast (for testing)
  if (message.type === "broadcast") {
    const apiClient = new ApiGatewayManagementApiClient({
      endpoint: `https://${domainName}/${stage}`,
    });

    // Get all connections
    const result = await ddb.send(
      new ScanCommand({
        TableName: Resource.SignageTable.name,
        FilterExpression: "begins_with(pk, :prefix)",
        ExpressionAttributeValues: {
          ":prefix": "CONNECTION#",
        },
      })
    );

    const connections = result.Items || [];
    console.log(`Broadcasting to ${connections.length} connections`);

    // Send to all connections
    const sendPromises = connections.map(async (conn) => {
      try {
        await apiClient.send(
          new PostToConnectionCommand({
            ConnectionId: conn.connectionId,
            Data: JSON.stringify({
              type: "frame",
              payload: message.payload,
              timestamp: Date.now(),
            }),
          })
        );
      } catch (error: unknown) {
        // Connection might be stale, log and continue
        console.log(`Failed to send to ${conn.connectionId}:`, error);
      }
    });

    await Promise.all(sendPromises);

    return { statusCode: 200, body: "Broadcast sent" };
  }

  return { statusCode: 200, body: "OK" };
};
