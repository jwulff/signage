/**
 * DynamoDB client configuration
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * Create a DynamoDB Document Client with sensible defaults
 */
export function createDocClient(region: string = "us-east-1"): DynamoDBDocumentClient {
  const client = new DynamoDBClient({ region });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });
}
