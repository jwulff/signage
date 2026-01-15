/**
 * WebSocket $connect handler
 * Called when a client establishes a WebSocket connection
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  // Query params are available on $connect but not in the base type
  const queryParams = (event as unknown as { queryStringParameters?: Record<string, string> }).queryStringParameters || {};
  const terminalId = queryParams.terminalId;
  const terminalType = queryParams.type || "unknown";

  console.log(`Client connected: ${connectionId}, terminal: ${terminalId}, type: ${terminalType}`);

  // Store connection in DynamoDB
  await ddb.send(
    new PutCommand({
      TableName: Resource.SignageTable.name,
      Item: {
        pk: `CONNECTION#${connectionId}`,
        sk: "METADATA",
        connectionId,
        terminalId: terminalId || null,
        terminalType,
        connectedAt: new Date().toISOString(),
      },
    })
  );

  return {
    statusCode: 200,
    body: "Connected",
  };
};
