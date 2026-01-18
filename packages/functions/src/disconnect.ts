/**
 * WebSocket $disconnect handler
 * Called when a client disconnects
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  console.log(`Client disconnected: ${connectionId}`);

  // Remove connection from DynamoDB
  await ddb.send(
    new DeleteCommand({
      TableName: Resource.SignageTable.name,
      Key: {
        pk: `CONNECTION#${connectionId}`,
        sk: "METADATA",
      },
    })
  );

  // Atomically decrement connection counter (floor at 0)
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: Resource.SignageTable.name,
        Key: { pk: "CONNECTION_COUNT#GLOBAL", sk: "COUNTER" },
        UpdateExpression: "SET #count = if_not_exists(#count, :zero) - :dec, updatedAt = :now",
        ConditionExpression: "attribute_not_exists(#count) OR #count > :zero",
        ExpressionAttributeNames: { "#count": "count" },
        ExpressionAttributeValues: { ":dec": 1, ":zero": 0, ":now": new Date().toISOString() },
      })
    );
  } catch (error: unknown) {
    // Ignore ConditionalCheckFailedException - counter is already at 0
    if ((error as { name?: string }).name !== "ConditionalCheckFailedException") {
      throw error;
    }
  }

  return {
    statusCode: 200,
    body: "Disconnected",
  };
};
