/**
 * Lightsail Health Check Lambda
 *
 * Runs hourly to check the signage-relay Lightsail instance status.
 * If status checks are failing, reboots the instance automatically.
 * Stores last reboot time in DynamoDB to prevent reboot loops.
 */

import { Resource } from "sst";
import {
  LightsailClient,
  GetInstanceMetricDataCommand,
  RebootInstanceCommand,
} from "@aws-sdk/client-lightsail";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const INSTANCE_NAME = "signage-relay";
const REBOOT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

const lightsail = new LightsailClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async () => {
  const now = Date.now();

  // Check StatusCheckFailed metric for the last 10 minutes
  const metricEnd = new Date(now);
  const metricStart = new Date(now - 10 * 60 * 1000);

  let hasFailing = false;

  try {
    const metricResponse = await lightsail.send(
      new GetInstanceMetricDataCommand({
        instanceName: INSTANCE_NAME,
        metricName: "StatusCheckFailed",
        period: 300, // 5-minute granularity
        startTime: metricStart,
        endTime: metricEnd,
        unit: "Count",
        statistics: ["Maximum"],
      })
    );

    const datapoints = metricResponse.metricData ?? [];
    hasFailing = datapoints.some((dp) => (dp.maximum ?? 0) >= 1.0);

    console.log(
      `Health check: ${datapoints.length} datapoints, failing=${hasFailing}`
    );
  } catch (error) {
    console.error("Failed to get Lightsail metrics:", error);
    return;
  }

  if (!hasFailing) {
    console.log(`${INSTANCE_NAME} is healthy, no action needed`);
    return;
  }

  // Check debounce: was a reboot triggered recently?
  try {
    const debounceResult = await ddb.send(
      new GetCommand({
        TableName: Resource.SignageTable.name,
        Key: { pk: "LIGHTSAIL_HEALTH", sk: "LAST_REBOOT" },
      })
    );

    const lastRebootTime = debounceResult.Item?.rebootedAt as number | undefined;
    if (lastRebootTime && now - lastRebootTime < REBOOT_COOLDOWN_MS) {
      const minutesAgo = Math.round((now - lastRebootTime) / 60_000);
      console.log(
        `Reboot skipped: last reboot was ${minutesAgo}min ago (cooldown: ${REBOOT_COOLDOWN_MS / 60_000}min)`
      );
      return;
    }
  } catch (error) {
    console.error("Failed to check reboot debounce:", error);
    // Continue with reboot — better to reboot than to stay stuck
  }

  // Reboot the instance
  try {
    await lightsail.send(
      new RebootInstanceCommand({ instanceName: INSTANCE_NAME })
    );
    console.log(`Rebooted ${INSTANCE_NAME}`);
  } catch (error) {
    console.error(`Failed to reboot ${INSTANCE_NAME}:`, error);
    return;
  }

  // Record reboot time for debounce
  try {
    await ddb.send(
      new PutCommand({
        TableName: Resource.SignageTable.name,
        Item: {
          pk: "LIGHTSAIL_HEALTH",
          sk: "LAST_REBOOT",
          rebootedAt: now,
        },
      })
    );
  } catch (error) {
    console.error("Failed to record reboot time:", error);
  }
};
