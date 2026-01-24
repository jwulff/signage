/**
 * WebSocket $default handler
 * Handles all incoming messages
 */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
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
  const { domainName } = event.requestContext;
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

  const apiClient = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}`,
  });

  // Handle client registration - send cached frame immediately
  if (message.type === "connect") {
    try {
      const cachedFrame = await ddb.send(
        new GetCommand({
          TableName: Resource.SignageTable.name,
          Key: { pk: "FRAME_CACHE", sk: "LATEST" },
        })
      );

      if (cachedFrame.Item) {
        await apiClient.send(
          new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: JSON.stringify({
              type: "frame",
              payload: {
                frame: {
                  width: cachedFrame.Item.width,
                  height: cachedFrame.Item.height,
                  data: cachedFrame.Item.frameData,
                },
              },
              timestamp: Date.now(),
            }),
          })
        );
        console.log(`Sent cached frame to ${connectionId}`);
      }
    } catch (error) {
      console.log(`Could not send cached frame: ${error}`);
    }

    return { statusCode: 200, body: "Registered" };
  }

  // Handle ping/pong
  if (message.type === "ping") {
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

    // Get all connections
    const result = await ddb.send(
      new QueryCommand({
        TableName: Resource.SignageTable.name,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": "CONNECTIONS",
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
