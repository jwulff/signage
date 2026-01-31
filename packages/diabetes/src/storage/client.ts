/**
 * DynamoDB client configuration
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * Create a DynamoDB Document Client with sensible defaults.
 * Region is determined from AWS_REGION environment variable (set by Lambda runtime)
 * or falls back to us-east-1 for local development.
 */
export function createDocClient(): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION ?? "us-east-1",
  });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });
}
