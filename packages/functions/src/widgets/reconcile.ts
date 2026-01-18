/**
 * Connection Counter Reconciliation
 * Counts actual CONNECTION# records and resets the counter to prevent drift.
 */

import { DynamoDBClient, paginateScan } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { ScheduledEvent } from "aws-lambda";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

/**
 * Count actual CONNECTION# records in DynamoDB.
 */
async function countActualConnections(): Promise<number> {
  let count = 0;

  const paginator = paginateScan(
    { client },
    {
      TableName: Resource.SignageTable.name,
      FilterExpression: "begins_with(pk, :prefix)",
      ExpressionAttributeValues: {
        ":prefix": { S: "CONNECTION#" },
      },
      Select: "COUNT",
    }
  );

  for await (const page of paginator) {
    count += page.Count || 0;
  }

  return count;
}

/**
 * Scheduled handler to reconcile connection counter.
 */
export const handler = async (_event: ScheduledEvent): Promise<void> => {
  console.log("Running connection counter reconciliation");

  const actualCount = await countActualConnections();
  console.log(`Actual connection count: ${actualCount}`);

  // Reset the counter to the actual value
  await ddb.send(
    new PutCommand({
      TableName: Resource.SignageTable.name,
      Item: {
        pk: "CONNECTION_COUNT#GLOBAL",
        sk: "COUNTER",
        count: actualCount,
        updatedAt: new Date().toISOString(),
        reconciledAt: new Date().toISOString(),
      },
    })
  );

  console.log(`Counter reconciled to ${actualCount}`);
};
