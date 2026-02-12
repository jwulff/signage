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

const AGENT_INSTRUCTION = `You are a friendly diabetes analyst for a Type 1 diabetic using an insulin pump.
Target range: 70-180 mg/dL. Time in range goal: >70%.

## Your Job
Analyze glucose data and store a short insight for the Pixoo64 LED display.
The display fits ONLY 30 characters (2 lines x 15 chars). Count carefully.

## Tools
- Query glucose readings, treatments, stats, and patterns
- Store insights via storeInsight (max 30 chars, with reasoning)
- Check insight history to avoid repeating yourself

## Writing Style
- Write like a caring friend texting — warm, natural, specific
- NO abbreviations (avg, hi, TIR, hrs, chk, stdy, grt, ovrnt)
- NO exact glucose numbers (say "high" not "241")
- Frame suggestions as questions ("bolus?" not "need bolus")
- Your insights display on the LED for up to 60 minutes — write about the current situation or pattern, not the current moment
- Prefer broader time descriptions ("steady afternoon", "smooth since lunch") over narrow ones ("right now", "just happened")
- NEVER repeat a recent insight — always say something new

## Colors (wrap entire message in ONE tag)
[green] = wins, in-range | [yellow] = caution, nudge | [red] = act now | [rainbow] = rare milestone

## storeInsight Parameters (ALL required for hourly)
- type: "hourly" | "daily" | "weekly"
- content: "[color]Your message[/]" (max 30 visible chars)
- reasoning: brief explanation of why you chose this insight`;

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
// Includes both Sonnet and Haiku families because the alias may route to older
// versions that use a different model than the current DRAFT.
const agentModelPolicy = new aws.iam.RolePolicy("DiabetesAnalystAgentModelPolicy", {
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
          // Sonnet 4.5 (current model)
          $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:*::foundation-model/anthropic.claude-sonnet-4-5*`,
          $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:${currentRegion.then((r) => r.name)}:${callerIdentity.then((id) => id.accountId)}:inference-profile/us.anthropic.claude-sonnet-4-5*`,
          // Haiku 4.5 (previous model — needed while alias routes to older versions)
          $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:*::foundation-model/anthropic.claude-haiku-4-5*`,
          $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:${currentRegion.then((r) => r.name)}:${callerIdentity.then((id) => id.accountId)}:inference-profile/us.anthropic.claude-haiku-4-5*`,
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
  foundationModel: $interpolate`arn:${currentPartition.then((p) => p.partition)}:bedrock:${currentRegion.then((r) => r.name)}:${callerIdentity.then((id) => id.accountId)}:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0`,
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

  // Prepare agent after updates to create new versions
  // Action groups use dependsOn chains to avoid race conditions
  prepareAgent: true,
  // Model policy must be applied BEFORE the agent model is changed.
  // Bedrock validates the agent role has permission for the new inference profile
  // during UpdateAgent — if the policy isn't applied yet, the deploy fails.
}, { dependsOn: [agentModelPolicy] });

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

// Agent alias for invoking the agent
// NOTE: Without explicit routingConfiguration, alias defaults to DRAFT version.
// After deploy creates a new version via prepareAgent, manually update alias
// in AWS Console: Bedrock > Agents > diabetes-analyst > Aliases > Edit routing
// TODO: Implement custom resource to auto-update alias to latest version
export const agentAlias = new aws.bedrock.AgentAgentAlias("DiabetesAnalystDraftAlias", {
  agentId: agent.agentId,
  agentAliasName: $interpolate`draft-${$app.stage}`,
  description: "Agent alias - update routing after deploy to use latest version",
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
