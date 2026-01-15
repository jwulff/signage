/**
 * WebSocket $disconnect handler
 * Called when a client disconnects
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";
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

  return {
    statusCode: 200,
    body: "Disconnected",
  };
};
