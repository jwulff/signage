/**
 * InsightTools Action Group
 *
 * Provides insight storage and retrieval for the Diabetes AI Analyst agent.
 * Insights are displayed on the Pixoo64 LED display.
 */

import { Resource } from "sst";
import {
  createDocClient,
  storeInsight,
  getCurrentInsight,
  getInsightHistory,
  getInsightStatus,
  getRecentInsightContents,
} from "@diabetes/core";
import type { InsightType, InsightMetrics, StoredInsight } from "@diabetes/core";

// Default user ID (single-user for now)
const DEFAULT_USER_ID = "john";

// DynamoDB client
const docClient = createDocClient();

/**
 * Bedrock Agent event types (OpenAPI-based action groups)
 */
interface BedrockAgentEvent {
  messageVersion: string;
  agent: { name: string; id: string; alias: string; version: string };
  inputText: string;
  sessionId: string;
  actionGroup: string;
  apiPath: string;
  httpMethod: string;
  parameters: Array<{ name: string; type: string; value: string }>;
}

interface BedrockAgentResponse {
  messageVersion: string;
  response: {
    actionGroup: string;
    apiPath: string;
    httpMethod: string;
    responseBody: { "application/json": { body: string } };
  };
}

function getParam(event: BedrockAgentEvent, name: string): string | undefined {
  return event.parameters?.find((p) => p.name === name)?.value;
}

function formatResponse(event: BedrockAgentEvent, body: unknown): BedrockAgentResponse {
  return {
    messageVersion: "1.0",
    response: {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      responseBody: { "application/json": { body: JSON.stringify(body) } },
    },
  };
}

import { stripMarkup } from "./insight-utils.js";

/**
 * Store a new insight (with dedup — rejects if identical to recent insights)
 */
async function saveInsight(
  type: InsightType,
  content: string,
  metrics?: InsightMetrics,
  reasoning?: string
): Promise<{
  success: boolean;
  insightId: string;
  displayedAt: number;
  deduplicated?: boolean;
}> {
  // Dedup: reject if this exact message was sent in the last 6 hours
  // Wrapped in try-catch so a transient DynamoDB error doesn't block insight storage
  if (type === "hourly") {
    try {
      const recentContents = await getRecentInsightContents(
        docClient,
        Resource.SignageTable.name,
        DEFAULT_USER_ID,
        6 // hours
      );

      const normalizedNew = stripMarkup(content);
      const isDuplicate = recentContents.some((recent) => stripMarkup(recent) === normalizedNew);

      if (isDuplicate) {
        console.log(`Dedup: rejected duplicate insight "${content}"`);
        return {
          success: false,
          insightId: "",
          displayedAt: 0,
          deduplicated: true,
        };
      }
    } catch (error) {
      console.error("Dedup check failed, proceeding without deduplication:", error);
    }
  }

  const result = await storeInsight(
    docClient,
    Resource.SignageTable.name,
    DEFAULT_USER_ID,
    type,
    content,
    metrics,
    reasoning
  );

  return {
    success: true,
    insightId: result.insightId,
    displayedAt: Date.now(),
  };
}

/**
 * Get the current insight for display
 */
async function fetchCurrentInsight(): Promise<{
  insight: StoredInsight | null;
  status: "fresh" | "stale" | "very_stale" | "unavailable";
  ageMinutes: number;
}> {
  const insight = await getCurrentInsight(
    docClient,
    Resource.SignageTable.name,
    DEFAULT_USER_ID
  );

  const status = getInsightStatus(insight);
  const ageMinutes = insight
    ? Math.round((Date.now() - insight.generatedAt) / 60000)
    : 0;

  return { insight, status, ageMinutes };
}

/**
 * Get insight history for a number of days
 */
async function fetchInsightHistory(days: number): Promise<{
  insights: Array<{
    insightId: string;
    type: InsightType;
    content: string;
    generatedAt: number;
    metrics?: InsightMetrics;
    reasoning?: string;
  }>;
  count: number;
  periodDays: number;
}> {
  const insights = await getInsightHistory(
    docClient,
    Resource.SignageTable.name,
    DEFAULT_USER_ID,
    days
  );

  return {
    insights: insights.map((i) => ({
      insightId: i.insightId,
      type: i.type,
      content: i.content,
      generatedAt: i.generatedAt,
      metrics: i.metrics,
      reasoning: i.reasoning,
    })),
    count: insights.length,
    periodDays: days,
  };
}

/**
 * Lambda handler for InsightTools action group
 */
export async function handler(
  event: BedrockAgentEvent
): Promise<BedrockAgentResponse> {
  console.log("InsightTools invoked:", {
    apiPath: event.apiPath,
    httpMethod: event.httpMethod,
    parameters: event.parameters,
  });

  try {
    switch (event.apiPath) {
      case "/storeInsight": {
        const type = (getParam(event, "type") || "hourly") as InsightType;
        const content = getParam(event, "content") || "";
        const reasoning = getParam(event, "reasoning");

        // Parse metrics from JSON string
        let metrics: InsightMetrics | undefined;
        const metricsJson = getParam(event, "metrics");
        if (metricsJson) {
          try {
            metrics = JSON.parse(metricsJson);
          } catch {
            // Use undefined if parsing fails
          }
        }

        const result = await saveInsight(type, content, metrics, reasoning);
        return formatResponse(event, result);
      }

      case "/getCurrentInsight": {
        const result = await fetchCurrentInsight();
        return formatResponse(event, result);
      }

      case "/getInsightHistory": {
        const days = parseInt(getParam(event, "days") || "2", 10);
        const result = await fetchInsightHistory(Math.min(Math.max(days, 1), 30));
        return formatResponse(event, result);
      }

      default:
        return formatResponse(event, { error: `Unknown API path: ${event.apiPath}` });
    }
  } catch (error) {
    console.error("InsightTools error:", error);
    return formatResponse(event, {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
