/**
 * Daily Analysis Lambda
 *
 * Triggered at 6 AM Pacific to summarize the previous day's glucose management.
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

  const sessionId = `daily-${Date.now()}`;

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
 * Daily analysis handler
 */
export const handler: ScheduledHandler = async () => {
  console.log("Daily analysis triggered");

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    const prompt = `Analyze my glucose data for yesterday (${dateStr}).

Please:
1. Get the daily aggregation for ${dateStr}
2. Review time in range, highs, and lows
3. Check for any patterns (overnight, post-meal, etc.)

Generate a SHORT daily summary insight (max 80 characters) that:
- Highlights the key metric (TIR or notable pattern)
- Gives one actionable suggestion if needed
- Celebrates if it was a good day

Store the insight using the storeInsight tool with type="daily".`;

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
          "daily",
          insightText
        );
      }
    }

    console.log("Daily analysis complete");
  } catch (error) {
    console.error("Daily analysis error:", error);
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
