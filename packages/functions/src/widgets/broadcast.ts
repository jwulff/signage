/**
 * Broadcast utility for widget updates
 */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { WidgetUpdateMessage } from "./types";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

/**
 * Broadcast a widget update to all connected clients.
 * @param widgetId The widget identifier
 * @param data The widget data to send
 * @param apiEndpoint The WebSocket API endpoint URL
 */
export async function broadcastWidgetUpdate(
  widgetId: string,
  data: unknown,
  apiEndpoint: string
): Promise<{ sent: number; failed: number }> {
  const apiClient = new ApiGatewayManagementApiClient({
    endpoint: apiEndpoint,
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
  console.log(`Broadcasting widget ${widgetId} to ${connections.length} connections`);

  const message: WidgetUpdateMessage = {
    type: "widget-update",
    widgetId,
    data,
    timestamp: Date.now(),
  };

  let sent = 0;
  let failed = 0;

  // Send to all connections in parallel
  const sendPromises = connections.map(async (conn) => {
    try {
      await apiClient.send(
        new PostToConnectionCommand({
          ConnectionId: conn.connectionId,
          Data: JSON.stringify(message),
        })
      );
      sent++;
    } catch (error: unknown) {
      failed++;
      // If connection is gone, clean it up
      if (error instanceof GoneException) {
        console.log(`Stale connection ${conn.connectionId}, removing`);
        await ddb.send(
          new DeleteCommand({
            TableName: Resource.SignageTable.name,
            Key: { pk: conn.pk, sk: conn.sk },
          })
        );
      } else {
        console.error(`Failed to send to ${conn.connectionId}:`, error);
      }
    }
  });

  await Promise.all(sendPromises);

  return { sent, failed };
}
