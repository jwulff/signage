/**
 * Bedrock Agent Infrastructure
 *
 * Creates the Diabetes AI Analyst agent using AWS Bedrock AgentCore.
 * Uses Pulumi AWS resources directly within SST.
 */

import { table } from "./storage";
import {
  glucoseToolsFunction,
  treatmentToolsFunction,
  analysisToolsFunction,
  insightToolsFunction,
  glucoseToolsSchema,
  treatmentToolsSchema,
  analysisToolsSchema,
  insightToolsSchema,
} from "./agent-tools";

// =============================================================================
// Agent System Prompt
// =============================================================================

const AGENT_INSTRUCTION = `You are a friendly and supportive diabetes analyst helping manage Type 1 diabetes.
Your role is to analyze glucose data, treatment patterns, and provide actionable insights.

## Communication Style
- Be warm, encouraging, and data-specific
- Use plain language, avoid medical jargon unless necessary
- Celebrate wins (good TIR, stable nights) before addressing areas for improvement
- Frame suggestions as options to consider, not mandates
- Be concise - users check this on a 64x64 LED display

## User Context
This user has Type 1 diabetes managed with an insulin pump. They have provided their pump settings:
- Target glucose range: 70-180 mg/dL
- Time in range goal: >70%

## Available Tools
You have access to tools to:
- Query glucose readings (CGM, fingerstick)
- Query treatment data (insulin boluses, carbs, basal rates)
- Calculate statistics (TIR, variability, trends)
- Store insights for display

## Analysis Guidelines
1. Always ground insights in the actual data
2. Look for patterns (time of day, day of week, meal-related)
3. Consider recent changes in behavior or settings
4. Reference ADA guidelines when relevant
5. Suggest one actionable change at a time

## Output Format for Insights
When generating an insight for the display:
- Title: 2-4 words (fits on small display)
- Body: 1-2 sentences max
- Metrics: Include relevant numbers (TIR%, avg glucose, etc.)
- Confidence: Rate your confidence in the insight (high/medium/low)`;

// =============================================================================
// Agent IAM Role
// =============================================================================

// Get AWS account info for ARN construction
const callerIdentity = aws.getCallerIdentity({});
const currentPartition = aws.getPartition({});
const currentRegion = aws.getRegion({});

// IAM role for the Bedrock Agent
// Name must match signage-* pattern for CI IAM permissions
export const agentRole = new aws.iam.Role("DiabetesAnalystAgentRole", {
  name: $interpolate`signage-diabetes-agent-${$app.stage}`,
  assumeRolePolicy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: ["sts:AssumeRole"],
        principals: [
          {
            type: "Service",
            identifiers: ["bedrock.amazonaws.com"],
          },
        ],
        conditions: [
          {
            test: "StringEquals",
            variable: "aws:SourceAccount",
            values: [callerIdentity.then((id) => id.accountId)],
          },
          {
            test: "ArnLike",
            variable: "aws:SourceArn",
            values: [
              $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:${currentRegion.then((r) => r.name)}:${callerIdentity.then((id) => id.accountId)}:agent/*`,
            ],
          },
        ],
      },
    ],
  }).json,
});

// Policy for the agent to invoke Lambda action groups
// Scoped to specific action group functions
new aws.iam.RolePolicy("DiabetesAnalystAgentLambdaPolicy", {
  role: agentRole.id,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: ["lambda:InvokeFunction"],
        resources: [
          glucoseToolsFunction.arn,
          treatmentToolsFunction.arn,
          analysisToolsFunction.arn,
          insightToolsFunction.arn,
        ],
        effect: "Allow",
      },
    ],
  }).json,
});

// Policy for the agent to access DynamoDB (read-only via GetItem and Query)
new aws.iam.RolePolicy("DiabetesAnalystAgentDynamoPolicy", {
  role: agentRole.id,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: [
          "dynamodb:GetItem",
          "dynamodb:Query",
        ],
        resources: [
          table.arn,
          $interpolate`${table.arn}/index/*`,
        ],
        effect: "Allow",
      },
    ],
  }).json,
});

// Policy for the agent to use the foundation model via inference profile
new aws.iam.RolePolicy("DiabetesAnalystAgentModelPolicy", {
  role: agentRole.id,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:GetInferenceProfile",
        ],
        resources: [
          // Foundation model (wildcard region for inference profile routing to us-east-1/2, us-west-2)
          $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:*::foundation-model/anthropic.claude-sonnet-4-5*`,
          // Inference profile (required for Claude 4.5)
          $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:${currentRegion.then((r) => r.name)}:${callerIdentity.then((id) => id.accountId)}:inference-profile/us.anthropic.claude-sonnet-4-5*`,
        ],
        effect: "Allow",
      },
    ],
  }).json,
});

// =============================================================================
// Bedrock Agent
// =============================================================================

export const agent = new aws.bedrock.AgentAgent("DiabetesAnalyst", {
  agentName: $interpolate`diabetes-analyst-${$app.stage}`,
  // Use inference profile ARN for Claude 4.5 (on-demand not supported for this model)
  foundationModel: $interpolate`arn:aws:bedrock:${currentRegion.then((r) => r.name)}:${callerIdentity.then((id) => id.accountId)}:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0`,
  agentResourceRoleArn: agentRole.arn,
  instruction: AGENT_INSTRUCTION,
  idleSessionTtlInSeconds: 3600, // 1 hour session timeout
  description: "AI analyst for Type 1 diabetes management. Analyzes glucose trends, treatment patterns, and provides actionable insights.",

  // Enable memory for persistent context across sessions
  memoryConfigurations: [
    {
      enabledMemoryTypes: ["SESSION_SUMMARY"],
      storageDays: 30, // Keep memory for 30 days
    },
  ],

  // Don't auto-prepare - we'll let the last action group handle it
  // This avoids race conditions when creating multiple action groups
  prepareAgent: false,
});

// =============================================================================
// Action Groups (created sequentially to avoid PrepareAgent race conditions)
// =============================================================================

// GlucoseDataTools action group (first in chain)
const glucoseActionGroup = new aws.bedrock.AgentAgentActionGroup("GlucoseDataToolsActionGroup", {
  agentId: agent.agentId,
  agentVersion: "DRAFT",
  actionGroupName: "GlucoseDataTools",
  description: "Tools for querying glucose readings and statistics",
  actionGroupExecutor: {
    lambda: glucoseToolsFunction.arn,
  },
  apiSchema: {
    payload: glucoseToolsSchema,
  },
  skipResourceInUseCheck: true,
});

// TreatmentDataTools action group (depends on glucose)
const treatmentActionGroup = new aws.bedrock.AgentAgentActionGroup("TreatmentDataToolsActionGroup", {
  agentId: agent.agentId,
  agentVersion: "DRAFT",
  actionGroupName: "TreatmentDataTools",
  description: "Tools for querying insulin and carb data",
  actionGroupExecutor: {
    lambda: treatmentToolsFunction.arn,
  },
  apiSchema: {
    payload: treatmentToolsSchema,
  },
  skipResourceInUseCheck: true,
}, { dependsOn: [glucoseActionGroup] });

// AnalysisTools action group (depends on treatment)
const analysisActionGroup = new aws.bedrock.AgentAgentActionGroup("AnalysisToolsActionGroup", {
  agentId: agent.agentId,
  agentVersion: "DRAFT",
  actionGroupName: "AnalysisTools",
  description: "Tools for aggregations and pattern detection",
  actionGroupExecutor: {
    lambda: analysisToolsFunction.arn,
  },
  apiSchema: {
    payload: analysisToolsSchema,
  },
  skipResourceInUseCheck: true,
}, { dependsOn: [treatmentActionGroup] });

// InsightTools action group (last in chain - this one will prepare the agent)
const insightActionGroup = new aws.bedrock.AgentAgentActionGroup("InsightToolsActionGroup", {
  agentId: agent.agentId,
  agentVersion: "DRAFT",
  actionGroupName: "InsightTools",
  description: "Tools for storing and retrieving AI insights",
  actionGroupExecutor: {
    lambda: insightToolsFunction.arn,
  },
  apiSchema: {
    payload: insightToolsSchema,
  },
  // Don't skip the check on the last one so it prepares the agent
}, { dependsOn: [analysisActionGroup] });

// Grant Bedrock permission to invoke the Lambda functions
new aws.lambda.Permission("GlucoseToolsBedrockPermission", {
  action: "lambda:InvokeFunction",
  function: glucoseToolsFunction.name,
  principal: "bedrock.amazonaws.com",
  sourceArn: agent.agentArn,
});

new aws.lambda.Permission("TreatmentToolsBedrockPermission", {
  action: "lambda:InvokeFunction",
  function: treatmentToolsFunction.name,
  principal: "bedrock.amazonaws.com",
  sourceArn: agent.agentArn,
});

new aws.lambda.Permission("AnalysisToolsBedrockPermission", {
  action: "lambda:InvokeFunction",
  function: analysisToolsFunction.name,
  principal: "bedrock.amazonaws.com",
  sourceArn: agent.agentArn,
});

new aws.lambda.Permission("InsightToolsBedrockPermission", {
  action: "lambda:InvokeFunction",
  function: insightToolsFunction.name,
  principal: "bedrock.amazonaws.com",
  sourceArn: agent.agentArn,
});

// Create an agent alias for the DRAFT version (for development)
// Depends on all action groups being created first
export const agentAlias = new aws.bedrock.AgentAgentAlias("DiabetesAnalystDraftAlias", {
  agentId: agent.agentId,
  agentAliasName: $interpolate`draft-${$app.stage}`,
  description: "Development alias pointing to DRAFT version",
}, { dependsOn: [insightActionGroup] });

// =============================================================================
// Exports
// =============================================================================

export const outputs = {
  agentId: agent.agentId,
  agentArn: agent.agentArn,
  agentAliasId: agentAlias.agentAliasId,
  agentAliasArn: agentAlias.agentAliasArn,
  agentRoleArn: agentRole.arn,
};
