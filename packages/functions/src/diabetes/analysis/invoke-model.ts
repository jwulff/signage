/**
 * Shared InvokeModel utility for diabetes insight generation.
 *
 * Wraps BedrockRuntimeClient with forced tool_use to guarantee structured JSON output.
 * Used by stream-trigger, daily, and weekly analysis handlers.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({});

export interface InsightResponse {
  content: string;
  reasoning: string;
}

/**
 * Invoke Claude via Bedrock InvokeModel with forced tool_use response.
 * Returns { content, reasoning } parsed from the model's respond tool call.
 */
export async function invokeModel(
  systemPrompt: string,
  userMessage: string
): Promise<InsightResponse> {
  const modelId = process.env.MODEL_ID;
  if (!modelId) {
    throw new Error("MODEL_ID environment variable must be set");
  }

  const response = await client.send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tool_choice: { type: "tool", name: "respond" },
        tools: [
          {
            name: "respond",
            description: "Store your insight for the LED display",
            input_schema: {
              type: "object",
              properties: {
                content: {
                  type: "string",
                  description:
                    "The insight text with color tag, max 30 visible chars. Example: [green]Steady all morning![/]",
                },
                reasoning: {
                  type: "string",
                  description: "Brief explanation of why you chose this insight",
                },
              },
              required: ["content", "reasoning"],
            },
          },
        ],
      }),
    })
  );

  const result = JSON.parse(new TextDecoder().decode(response.body));

  // Search by type — Claude may emit a text block before the tool call
  const toolUseBlock = result.content?.find(
    (block: { type: string }) => block.type === "tool_use"
  );
  if (!toolUseBlock?.input) {
    throw new Error("Model did not return a valid tool_use block");
  }

  const { content, reasoning } = toolUseBlock.input;
  if (typeof content !== "string" || typeof reasoning !== "string") {
    throw new Error("Model tool_use response missing content or reasoning");
  }

  return { content, reasoning };
}
