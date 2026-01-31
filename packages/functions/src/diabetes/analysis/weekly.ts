/**
 * Weekly Analysis Lambda
 *
 * Triggered Sunday at 8 AM Pacific to review weekly patterns and trends.
 */

import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { Resource } from "sst";
import { createDocClient, storeInsight } from "@diabetes/core";
import type { ScheduledHandler } from "aws-lambda";

const bedrockClient = new BedrockAgentRuntimeClient({});
const docClient = createDocClient();

const DEFAULT_USER_ID = "john";

/**
 * Invoke the diabetes analyst agent
 */
async function invokeAgent(prompt: string): Promise<string> {
  const agentId = process.env.AGENT_ID;
  const agentAliasId = process.env.AGENT_ALIAS_ID;

  if (!agentId || !agentAliasId) {
    throw new Error("AGENT_ID and AGENT_ALIAS_ID must be set");
  }

  const sessionId = `weekly-${Date.now()}`;

  const response = await bedrockClient.send(
    new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId,
      inputText: prompt,
    })
  );

  let responseText = "";
  if (response.completion) {
    for await (const chunk of response.completion) {
      if (chunk.chunk?.bytes) {
        responseText += new TextDecoder().decode(chunk.chunk.bytes);
      }
    }
  }

  return responseText;
}

/**
 * Weekly analysis handler
 */
export const handler: ScheduledHandler = async () => {
  console.log("Weekly analysis triggered");

  try {
    const prompt = `Analyze my glucose data for the past week.

Please:
1. Get the weekly aggregation (current week)
2. Detect any patterns (overnight lows, meal spikes, dawn phenomenon)
3. Compare daily TIR values across the week
4. Note any day-of-week patterns

Generate a SHORT weekly summary insight (max 80 characters) that:
- Highlights the week's TIR or key achievement
- Identifies one pattern to address (if any)
- Provides encouragement

Store the insight using the storeInsight tool with type="weekly".`;

    const response = await invokeAgent(prompt);
    console.log("Agent response:", response);

    // Fallback if agent didn't store insight
    if (!response.includes("stored")) {
      const insightText = extractInsightFromResponse(response);
      if (insightText) {
        await storeInsight(
          docClient,
          Resource.SignageTable.name,
          DEFAULT_USER_ID,
          "weekly",
          insightText
        );
      }
    }

    console.log("Weekly analysis complete");
  } catch (error) {
    console.error("Weekly analysis error:", error);
    // Rethrow to trigger Lambda retry mechanism for transient errors
    throw error;
  }
};

function extractInsightFromResponse(response: string): string | null {
  const lines = response.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 10 && trimmed.length <= 80 && !trimmed.includes("?") && !trimmed.startsWith("{")) {
      return trimmed;
    }
  }
  return response.length > 0 ? response.slice(0, 80).trim() : null;
}
