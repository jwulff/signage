/**
 * Hourly Analysis Lambda
 *
 * Triggered every hour to analyze recent glucose trends and generate insights.
 * Invokes the Bedrock Agent to produce actionable insights for the display.
 */

import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { Resource } from "sst";
import { createDocClient, storeInsight, getCurrentInsight } from "@diabetes/core";
import type { ScheduledHandler } from "aws-lambda";

const bedrockClient = new BedrockAgentRuntimeClient({});
const docClient = createDocClient();

const DEFAULT_USER_ID = "john";

// LED display fits 30 characters (2 lines x 15 chars)
const MAX_INSIGHT_LENGTH = 30;
const MAX_SHORTEN_ATTEMPTS = 2;

/**
 * Invoke the diabetes analyst agent with a prompt
 */
async function invokeAgent(prompt: string, sessionId: string): Promise<string> {
  const agentId = process.env.AGENT_ID;
  const agentAliasId = process.env.AGENT_ALIAS_ID;

  if (!agentId || !agentAliasId) {
    throw new Error("AGENT_ID and AGENT_ALIAS_ID must be set");
  }

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

  const sessionId = `hourly-${Date.now()}`;

  try {
    // Prompt the agent to analyze recent glucose data
    const initialPrompt = `Analyze my glucose data from the last 4 hours.

Focus on:
1. Current trend (rising, falling, stable)
2. Time in range for this period
3. Any concerning patterns (lows, highs, rapid changes)

Generate a SHORT insight (max 30 characters) for my LED display. The insight should be:
- Data-specific (mention actual numbers)
- Actionable if there's something to address
- Encouraging if things are going well

CRITICAL: Maximum 30 characters total. Use abbreviations: avg, h, d, %, TIR, grt, chk, ↑, ↓, →

Store the insight using the storeInsight tool with type="hourly".`;

    const response = await invokeAgent(initialPrompt, sessionId);
    console.log("Agent response:", response);

    // The agent should have called storeInsight via the tool
    // If it didn't, store a fallback insight
    if (!response.includes("stored") && !response.includes("insight")) {
      const insightText = extractInsightFromResponse(response);
      if (insightText) {
        await storeInsight(
          docClient,
          Resource.SignageTable.name,
          DEFAULT_USER_ID,
          "hourly",
          insightText.slice(0, MAX_INSIGHT_LENGTH)
        );
      }
    }

    // Check if the stored insight is too long and retry if needed
    await enforceInsightLength(sessionId);

    console.log("Hourly analysis complete");
  } catch (error) {
    console.error("Hourly analysis error:", error);
    // Rethrow to trigger Lambda retry mechanism for transient errors
    throw error;
  }
};

/**
 * Check the stored insight length and ask agent to shorten if needed
 */
async function enforceInsightLength(sessionId: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_SHORTEN_ATTEMPTS; attempt++) {
    const insight = await getCurrentInsight(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID
    );

    if (!insight) {
      console.log("No insight found to check length");
      return;
    }

    // Only shorten hourly insights to avoid accidentally modifying daily/weekly insights
    if (insight.type !== "hourly") {
      console.log(`Skipping length check for ${insight.type} insight`);
      return;
    }

    const contentLength = insight.content.length;
    console.log(`Insight length check: ${contentLength} chars (max ${MAX_INSIGHT_LENGTH})`);

    if (contentLength <= MAX_INSIGHT_LENGTH) {
      console.log("Insight length OK");
      return;
    }

    // Insight is too long, ask agent to shorten it
    console.log(`Insight too long (${contentLength} chars), asking agent to shorten (attempt ${attempt + 1}/${MAX_SHORTEN_ATTEMPTS})`);

    const shortenPrompt = `The insight you just stored is TOO LONG for my LED display.

Current insight (${contentLength} chars): "${insight.content}"
Maximum allowed: ${MAX_INSIGHT_LENGTH} characters

Please SHORTEN this to ${MAX_INSIGHT_LENGTH} characters or less while keeping the key information.
Use aggressive abbreviations: avg, h, d, %, ↑, ↓, →, grt, chk, stdy, hi, lo

Store the shortened version using storeInsight with type="hourly".`;

    const response = await invokeAgent(shortenPrompt, sessionId);
    console.log("Shorten response:", response);
  }

  // After max attempts, truncate manually if still too long
  const finalInsight = await getCurrentInsight(
    docClient,
    Resource.SignageTable.name,
    DEFAULT_USER_ID
  );

  if (finalInsight && finalInsight.type === "hourly" && finalInsight.content.length > MAX_INSIGHT_LENGTH) {
    console.warn(`Insight still too long after ${MAX_SHORTEN_ATTEMPTS} attempts, truncating`);
    await storeInsight(
      docClient,
      Resource.SignageTable.name,
      DEFAULT_USER_ID,
      "hourly",
      finalInsight.content.slice(0, MAX_INSIGHT_LENGTH)
    );
  }
}

/**
 * Extract insight text from agent response
 */
function extractInsightFromResponse(response: string): string | null {
  const lines = response.split("\n").filter((l) => l.trim());

  // Look for a line that could be an insight (short, informative)
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 10 && trimmed.length <= MAX_INSIGHT_LENGTH) {
      if (!trimmed.includes("?") && !trimmed.startsWith("{")) {
        return trimmed;
      }
    }
  }

  // Fallback: take first MAX_INSIGHT_LENGTH chars
  if (response.length > 0) {
    return response.slice(0, MAX_INSIGHT_LENGTH).trim();
  }

  return null;
}
