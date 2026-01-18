/**
 * Connection count helpers for widget updaters
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

/**
 * Get the current connection count from DynamoDB.
 * @returns The number of active WebSocket connections
 */
export async function getConnectionCount(): Promise<number> {
  const result = await ddb.send(
    new GetCommand({
      TableName: Resource.SignageTable.name,
      Key: { pk: "CONNECTION_COUNT#GLOBAL", sk: "COUNTER" },
    })
  );

  return (result.Item?.count as number) || 0;
}

/**
 * Check if there are any active WebSocket connections.
 * @returns True if at least one connection exists
 */
export async function hasActiveConnections(): Promise<boolean> {
  const count = await getConnectionCount();
  return count > 0;
}
