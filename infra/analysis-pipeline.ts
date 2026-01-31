/**
 * Analysis Pipeline Infrastructure
 *
 * Event-driven pipeline that triggers AI analysis at regular intervals.
 * Uses EventBridge rules to schedule analysis workflows.
 */

import { table } from "./storage";
import { agent, agentAlias } from "./agent";

// =============================================================================
// Shared Configuration
// =============================================================================

// Function config for analysis handlers
// Using inline function definitions with Cron to avoid SST function reference issues
const analysisEnvironment = {
  AGENT_ID: agent.agentId,
  AGENT_ALIAS_ID: agentAlias.agentAliasId,
};

// =============================================================================
// EventBridge Scheduled Rules with Inline Functions
// =============================================================================

// Hourly analysis - every hour
// Analyzes recent glucose trends and generates insights
export const hourlyAnalysisCron = new sst.aws.Cron("HourlyAnalysisCron", {
  schedule: "rate(1 hour)",
  function: {
    handler: "packages/functions/src/diabetes/analysis/hourly.handler",
    link: [table],
    timeout: "120 seconds",
    memory: "512 MB",
    description: "Hourly glucose trend analysis",
    environment: analysisEnvironment,
  },
});

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
// IAM Permissions for Agent Invocation
// =============================================================================

// Allow analysis functions to invoke the Bedrock Agent
new aws.iam.RolePolicy("HourlyAnalysisAgentPolicy", {
  role: hourlyAnalysisCron.nodes.function.role,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: ["bedrock:InvokeAgent"],
        resources: [agentAlias.agentAliasArn],
        effect: "Allow",
      },
    ],
  }).json,
});

new aws.iam.RolePolicy("DailyAnalysisAgentPolicy", {
  role: dailyAnalysisCron.nodes.function.role,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: ["bedrock:InvokeAgent"],
        resources: [agentAlias.agentAliasArn],
        effect: "Allow",
      },
    ],
  }).json,
});

new aws.iam.RolePolicy("WeeklyAnalysisAgentPolicy", {
  role: weeklyAnalysisCron.nodes.function.role,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: ["bedrock:InvokeAgent"],
        resources: [agentAlias.agentAliasArn],
        effect: "Allow",
      },
    ],
  }).json,
});

// =============================================================================
// Exports
// =============================================================================

export const outputs = {
  hourlyAnalysisArn: hourlyAnalysisCron.nodes.function.arn,
  dailyAnalysisArn: dailyAnalysisCron.nodes.function.arn,
  weeklyAnalysisArn: weeklyAnalysisCron.nodes.function.arn,
};
