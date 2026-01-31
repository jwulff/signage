/**
 * Hourly Analysis Lambda
 *
 * Triggered every hour to analyze recent glucose trends and generate insights.
 * Invokes the Bedrock Agent to produce actionable insights for the display.
 */

import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { Resource } from "sst";
import { createDocClient, storeInsight } from "@diabetes/core";
import type { ScheduledHandler } from "aws-lambda";

const bedrockClient = new BedrockAgentRuntimeClient({});
const docClient = createDocClient();

const DEFAULT_USER_ID = "john";

/**
 * Invoke the diabetes analyst agent with a prompt
 */
async function invokeAgent(prompt: string): Promise<string> {
  const agentId = process.env.AGENT_ID;
  const agentAliasId = process.env.AGENT_ALIAS_ID;

  if (!agentId || !agentAliasId) {
    throw new Error("AGENT_ID and AGENT_ALIAS_ID must be set");
  }

  const sessionId = `hourly-${Date.now()}`;

  const response = await bedrockClient.send(
    new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId,
      inputText: prompt,
    })
  );

  // Collect response chunks
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
 * Hourly analysis handler
 */
export const handler: ScheduledHandler = async () => {
  console.log("Hourly analysis triggered");

  try {
    // Prompt the agent to analyze recent glucose data
    const prompt = `Analyze my glucose data from the last 4 hours.

Focus on:
1. Current trend (rising, falling, stable)
2. Time in range for this period
3. Any concerning patterns (lows, highs, rapid changes)

Generate a SHORT insight (max 80 characters) for my display. The insight should be:
- Data-specific (mention actual numbers)
- Actionable if there's something to address
- Encouraging if things are going well

Store the insight using the storeInsight tool with type="hourly".`;

    const response = await invokeAgent(prompt);
    console.log("Agent response:", response);

    // The agent should have called storeInsight via the tool
    // If it didn't, store a fallback insight
    if (!response.includes("stored") && !response.includes("insight")) {
      // Agent didn't seem to store an insight, extract and store manually
      const insightText = extractInsightFromResponse(response);
      if (insightText) {
        await storeInsight(
          docClient,
          Resource.SignageTable.name,
          DEFAULT_USER_ID,
          "hourly",
          insightText
        );
      }
    }

    console.log("Hourly analysis complete");
  } catch (error) {
    console.error("Hourly analysis error:", error);
    // Rethrow to trigger Lambda retry mechanism for transient errors
    throw error;
  }
};

/**
 * Extract insight text from agent response
 */
function extractInsightFromResponse(response: string): string | null {
  // Try to find a short summary in the response
  const lines = response.split("\n").filter((l) => l.trim());

  // Look for a line that could be an insight (short, informative)
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 10 && trimmed.length <= 80) {
      // Skip lines that look like questions or tool calls
      if (!trimmed.includes("?") && !trimmed.startsWith("{")) {
        return trimmed;
      }
    }
  }

  // Fallback: take first 80 chars
  if (response.length > 0) {
    return response.slice(0, 80).trim();
  }

  return null;
}
