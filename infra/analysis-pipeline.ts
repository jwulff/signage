/**
 * Analysis Pipeline Infrastructure
 *
 * Event-driven pipeline that triggers AI analysis when new diabetes data arrives.
 * Uses DynamoDB Streams for real-time analysis and EventBridge for daily/weekly summaries.
 *
 * Each Lambda pre-fetches its own data from DynamoDB and calls Claude via
 * Bedrock InvokeModel directly — no agent framework.
 */

import { table } from "./storage";

// =============================================================================
// Model Configuration
// =============================================================================

const callerIdentity = aws.getCallerIdentity({});
const currentPartition = aws.getPartition({});
const currentRegion = aws.getRegion({});

// Inference profile ARN for Claude Sonnet 4.5
const modelId = $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:${currentRegion.then((r) => r.name)}:${callerIdentity.then((id) => id.accountId)}:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0`;

const analysisEnvironment = {
  MODEL_ID: modelId,
};

// =============================================================================
// DynamoDB Stream Consumer (Real-Time Analysis)
// =============================================================================

// Stream-triggered analysis - runs when new diabetes data arrives
// Filters for CGM records and applies freshness/debounce checks
const analysisStreamConsumer = table.subscribe(
  "AnalysisStreamConsumer",
  {
    handler: "packages/functions/src/diabetes/analysis/stream-trigger.handler",
    link: [table],
    timeout: "120 seconds",
    memory: "512 MB",
    description: "Event-driven glucose analysis triggered by new diabetes data",
    environment: analysisEnvironment,
  },
  {
    transform: {
      eventSourceMapping: {
        // Serial processing for batch writes (Glooko sends 285 records at once)
        parallelizationFactor: 1,
      },
    },
  }
);

// =============================================================================
// EventBridge Scheduled Rules (Periodic Summaries)
// =============================================================================

// Daily analysis - 14:00 UTC (6 AM PST / 7 AM PDT)
// Note: Fixed UTC time means this shifts by 1 hour during DST
export const dailyAnalysisCron = new sst.aws.Cron("DailyAnalysisCron", {
  schedule: "cron(0 14 * * ? *)",
  function: {
    handler: "packages/functions/src/diabetes/analysis/daily.handler",
    link: [table],
    timeout: "180 seconds",
    memory: "512 MB",
    description: "Daily glucose summary analysis",
    environment: analysisEnvironment,
  },
});

// Weekly analysis - Sunday 16:00 UTC (8 AM PST / 9 AM PDT)
// Note: Fixed UTC time means this shifts by 1 hour during DST
export const weeklyAnalysisCron = new sst.aws.Cron("WeeklyAnalysisCron", {
  schedule: "cron(0 16 ? * SUN *)",
  function: {
    handler: "packages/functions/src/diabetes/analysis/weekly.handler",
    link: [table],
    timeout: "300 seconds",
    memory: "1024 MB",
    description: "Weekly pattern review analysis",
    environment: analysisEnvironment,
  },
});

// =============================================================================
// IAM Permissions for InvokeModel
// =============================================================================

// Inference profile ARN pattern for all Sonnet 4.5 versions
const inferenceProfileArn = $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:${currentRegion.then((r) => r.name)}:${callerIdentity.then((id) => id.accountId)}:inference-profile/us.anthropic.claude-sonnet-4-5*`;

new aws.iam.RolePolicy("AnalysisStreamModelPolicy", {
  role: analysisStreamConsumer.nodes.function.role,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: ["bedrock:InvokeModel"],
        resources: [inferenceProfileArn],
        effect: "Allow",
      },
    ],
  }).json,
});

new aws.iam.RolePolicy("DailyAnalysisModelPolicy", {
  role: dailyAnalysisCron.nodes.function.role,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: ["bedrock:InvokeModel"],
        resources: [inferenceProfileArn],
        effect: "Allow",
      },
    ],
  }).json,
});

new aws.iam.RolePolicy("WeeklyAnalysisModelPolicy", {
  role: weeklyAnalysisCron.nodes.function.role,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: ["bedrock:InvokeModel"],
        resources: [inferenceProfileArn],
        effect: "Allow",
      },
    ],
  }).json,
});

// =============================================================================
// Exports
// =============================================================================

export const outputs = {
  analysisStreamConsumerArn: analysisStreamConsumer.nodes.function.arn,
  dailyAnalysisArn: dailyAnalysisCron.nodes.function.arn,
  weeklyAnalysisArn: weeklyAnalysisCron.nodes.function.arn,
};
