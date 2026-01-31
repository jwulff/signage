/**
 * Analysis Pipeline Infrastructure
 *
 * Event-driven pipeline that triggers AI analysis at regular intervals.
 * Uses EventBridge rules to schedule analysis workflows.
 */

import { table } from "./storage";
import { agent, agentAlias } from "./agent";

// =============================================================================
// Analysis Lambda Functions
// =============================================================================

// Hourly analysis - triggered every hour
// Analyzes recent glucose trends and generates insights
export const hourlyAnalysisFunction = new sst.aws.Function("HourlyAnalysis", {
  handler: "packages/functions/src/diabetes/analysis/hourly.handler",
  link: [table],
  timeout: "120 seconds",
  memory: "512 MB",
  description: "Hourly glucose trend analysis",
  environment: {
    AGENT_ID: agent.agentId,
    AGENT_ALIAS_ID: agentAlias.agentAliasId,
  },
});

// Daily analysis - triggered at 6 AM Pacific
// Summarizes previous day's glucose management
export const dailyAnalysisFunction = new sst.aws.Function("DailyAnalysis", {
  handler: "packages/functions/src/diabetes/analysis/daily.handler",
  link: [table],
  timeout: "180 seconds",
  memory: "512 MB",
  description: "Daily glucose summary analysis",
  environment: {
    AGENT_ID: agent.agentId,
    AGENT_ALIAS_ID: agentAlias.agentAliasId,
  },
});

// Weekly analysis - triggered Sunday at 8 AM Pacific
// Reviews weekly patterns and trends
export const weeklyAnalysisFunction = new sst.aws.Function("WeeklyAnalysis", {
  handler: "packages/functions/src/diabetes/analysis/weekly.handler",
  link: [table],
  timeout: "300 seconds",
  memory: "1024 MB",
  description: "Weekly pattern review analysis",
  environment: {
    AGENT_ID: agent.agentId,
    AGENT_ALIAS_ID: agentAlias.agentAliasId,
  },
});

// =============================================================================
// IAM Permissions for Agent Invocation
// =============================================================================

// Allow analysis functions to invoke the Bedrock Agent
new aws.iam.RolePolicy("HourlyAnalysisAgentPolicy", {
  role: hourlyAnalysisFunction.nodes.function.role,
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
  role: dailyAnalysisFunction.nodes.function.role,
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
  role: weeklyAnalysisFunction.nodes.function.role,
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
// EventBridge Scheduled Rules
// =============================================================================

// Hourly analysis - every hour
export const hourlyAnalysisCron = new sst.aws.Cron("HourlyAnalysisCron", {
  schedule: "rate(1 hour)",
  function: hourlyAnalysisFunction,
});

// Daily analysis - 6 AM Pacific (14:00 UTC in winter, 13:00 in summer)
// Using UTC to avoid DST issues
export const dailyAnalysisCron = new sst.aws.Cron("DailyAnalysisCron", {
  schedule: "cron(0 14 * * ? *)",
  function: dailyAnalysisFunction,
});

// Weekly analysis - Sunday 8 AM Pacific (16:00 UTC)
export const weeklyAnalysisCron = new sst.aws.Cron("WeeklyAnalysisCron", {
  schedule: "cron(0 16 ? * SUN *)",
  function: weeklyAnalysisFunction,
});

// =============================================================================
// Exports
// =============================================================================

export const outputs = {
  hourlyAnalysisArn: hourlyAnalysisFunction.arn,
  dailyAnalysisArn: dailyAnalysisFunction.arn,
  weeklyAnalysisArn: weeklyAnalysisFunction.arn,
};
