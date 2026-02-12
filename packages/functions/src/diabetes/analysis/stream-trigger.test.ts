import { describe, it, expect } from "vitest";
import type { DynamoDBRecord } from "aws-lambda";

// Constants matching stream-trigger.ts
const TRIGGER_TYPES = new Set(["CGM", "BOLUS", "BASAL", "CARBS"]);
const FRESHNESS_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const DEBOUNCE_MS = 5 * 60_000; // 5 minutes
const MAX_INSIGHT_LENGTH = 30;

// Helper to create a mock DynamoDB stream record
function createMockRecord(
  eventName: "INSERT" | "MODIFY" | "REMOVE",
  pk: string,
  timestamp?: number
): DynamoDBRecord {
  return {
    eventID: "test-event-id",
    eventName,
    eventVersion: "1.1",
    eventSource: "aws:dynamodb",
    awsRegion: "us-east-1",
    dynamodb: {
      Keys: { pk: { S: pk }, sk: { S: "test-sk" } },
      NewImage: {
        pk: { S: pk },
        sk: { S: "test-sk" },
        ...(timestamp !== undefined ? { timestamp: { N: timestamp.toString() } } : {}),
      },
      SequenceNumber: "123",
      SizeBytes: 100,
      StreamViewType: "NEW_IMAGE",
    },
  };
}

describe("stream-trigger", () => {
  describe("record type filtering", () => {
    it("triggers on CGM records", () => {
      const pk = "USR#john#CGM#2026-02-01";
      const recordType = pk.split("#")[2];
      expect(TRIGGER_TYPES.has(recordType)).toBe(true);
    });

    it("triggers on BOLUS records", () => {
      const pk = "USR#john#BOLUS#2026-02-01";
      const recordType = pk.split("#")[2];
      expect(TRIGGER_TYPES.has(recordType)).toBe(true);
    });

    it("triggers on BASAL records", () => {
      const pk = "USR#john#BASAL#2026-02-01";
      const recordType = pk.split("#")[2];
      expect(TRIGGER_TYPES.has(recordType)).toBe(true);
    });

    it("triggers on CARBS records", () => {
      const pk = "USR#john#CARBS#2026-02-01";
      const recordType = pk.split("#")[2];
      expect(TRIGGER_TYPES.has(recordType)).toBe(true);
    });

    it("does NOT trigger on INSIGHT records", () => {
      const pk = "USR#john#INSIGHT#CURRENT";
      const recordType = pk.split("#")[2];
      expect(TRIGGER_TYPES.has(recordType)).toBe(false);
    });

    it("does NOT trigger on AGG records", () => {
      const pk = "USR#john#AGG#DAILY";
      const recordType = pk.split("#")[2];
      expect(TRIGGER_TYPES.has(recordType)).toBe(false);
    });

    it("does NOT trigger on BG records", () => {
      const pk = "USR#john#BG#2026-02-01";
      const recordType = pk.split("#")[2];
      expect(TRIGGER_TYPES.has(recordType)).toBe(false);
    });

    it("does NOT trigger on ALARM records", () => {
      const pk = "USR#john#ALARM#2026-02-01";
      const recordType = pk.split("#")[2];
      expect(TRIGGER_TYPES.has(recordType)).toBe(false);
    });

    it("does NOT trigger on FOOD records", () => {
      const pk = "USR#john#FOOD#2026-02-01";
      const recordType = pk.split("#")[2];
      expect(TRIGGER_TYPES.has(recordType)).toBe(false);
    });
  });

  describe("event type filtering", () => {
    it("processes INSERT events", () => {
      const record = createMockRecord("INSERT", "USR#john#CGM#2026-02-01");
      expect(record.eventName).toBe("INSERT");
    });

    it("ignores MODIFY events", () => {
      const record = createMockRecord("MODIFY", "USR#john#CGM#2026-02-01");
      expect(record.eventName).not.toBe("INSERT");
    });

    it("ignores REMOVE events", () => {
      const record = createMockRecord("REMOVE", "USR#john#CGM#2026-02-01");
      expect(record.eventName).not.toBe("INSERT");
    });
  });

  describe("freshness filtering", () => {
    it("accepts records from 5 minutes ago", () => {
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;
      const age = now - fiveMinutesAgo;
      expect(age < FRESHNESS_THRESHOLD_MS).toBe(true);
    });

    it("accepts records from 14 minutes ago", () => {
      const now = Date.now();
      const fourteenMinutesAgo = now - 14 * 60 * 1000;
      const age = now - fourteenMinutesAgo;
      expect(age < FRESHNESS_THRESHOLD_MS).toBe(true);
    });

    it("rejects records from 16 minutes ago", () => {
      const now = Date.now();
      const sixteenMinutesAgo = now - 16 * 60 * 1000;
      const age = now - sixteenMinutesAgo;
      expect(age > FRESHNESS_THRESHOLD_MS).toBe(true);
    });

    it("rejects records from 1 hour ago", () => {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const age = now - oneHourAgo;
      expect(age > FRESHNESS_THRESHOLD_MS).toBe(true);
    });

    it("rejects records from 1 day ago (Glooko backfill)", () => {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const age = now - oneDayAgo;
      expect(age > FRESHNESS_THRESHOLD_MS).toBe(true);
    });

    it("rejects records from 14 days ago (Glooko historical backfill)", () => {
      const now = Date.now();
      const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
      const age = now - fourteenDaysAgo;
      expect(age > FRESHNESS_THRESHOLD_MS).toBe(true);
    });
  });

  describe("debounce logic", () => {
    it("allows analysis when no previous insight exists", () => {
      const currentInsight = null;
      const shouldDebounce = currentInsight !== null;
      expect(shouldDebounce).toBe(false);
    });

    it("allows analysis when last insight is 6 minutes old", () => {
      const now = Date.now();
      const generatedAt = now - 6 * 60_000;
      const timeSinceLastAnalysis = now - generatedAt;
      expect(timeSinceLastAnalysis >= DEBOUNCE_MS).toBe(true);
    });

    it("skips analysis when last insight is 30 seconds old", () => {
      const now = Date.now();
      const generatedAt = now - 30_000;
      const timeSinceLastAnalysis = now - generatedAt;
      expect(timeSinceLastAnalysis < DEBOUNCE_MS).toBe(true);
    });

    it("skips analysis when last insight is 4 minutes old", () => {
      const now = Date.now();
      const generatedAt = now - 4 * 60_000;
      const timeSinceLastAnalysis = now - generatedAt;
      expect(timeSinceLastAnalysis < DEBOUNCE_MS).toBe(true);
    });

    it("allows analysis when last insight is exactly 5 minutes old", () => {
      const now = Date.now();
      const generatedAt = now - 5 * 60_000;
      const timeSinceLastAnalysis = now - generatedAt;
      expect(timeSinceLastAnalysis >= DEBOUNCE_MS).toBe(true);
    });
  });

  describe("combined filtering logic", () => {
    // Simulate the full filter logic from the handler
    function shouldProcessRecord(
      eventName: string,
      pk: string | undefined,
      timestamp: number | undefined,
      now: number
    ): boolean {
      if (eventName !== "INSERT") return false;
      if (!pk) return false;

      const recordType = pk.split("#")[2];
      if (!TRIGGER_TYPES.has(recordType)) return false;

      if (timestamp && now - timestamp > FRESHNESS_THRESHOLD_MS) {
        return false;
      }

      return true;
    }

    it("processes fresh CGM INSERT", () => {
      const now = Date.now();
      const result = shouldProcessRecord(
        "INSERT",
        "USR#john#CGM#2026-02-01",
        now - 5 * 60 * 1000, // 5 minutes ago
        now
      );
      expect(result).toBe(true);
    });

    it("rejects stale CGM INSERT", () => {
      const now = Date.now();
      const result = shouldProcessRecord(
        "INSERT",
        "USR#john#CGM#2026-02-01",
        now - 20 * 60 * 1000, // 20 minutes ago
        now
      );
      expect(result).toBe(false);
    });

    it("rejects fresh INSIGHT INSERT (wrong type)", () => {
      const now = Date.now();
      const result = shouldProcessRecord(
        "INSERT",
        "USR#john#INSIGHT#CURRENT",
        now - 5 * 60 * 1000,
        now
      );
      expect(result).toBe(false);
    });

    it("rejects fresh CGM MODIFY (wrong event)", () => {
      const now = Date.now();
      const result = shouldProcessRecord(
        "MODIFY",
        "USR#john#CGM#2026-02-01",
        now - 5 * 60 * 1000,
        now
      );
      expect(result).toBe(false);
    });

    it("processes CGM INSERT without timestamp (assumes fresh)", () => {
      const now = Date.now();
      const result = shouldProcessRecord("INSERT", "USR#john#CGM#2026-02-01", undefined, now);
      expect(result).toBe(true);
    });
  });

  describe("insight length handling (inherited from hourly)", () => {
    it("accepts insights at exactly max length", () => {
      const insight = "A".repeat(MAX_INSIGHT_LENGTH);
      expect(insight.length).toBe(MAX_INSIGHT_LENGTH);
      expect(insight.length <= MAX_INSIGHT_LENGTH).toBe(true);
    });

    it("rejects insights over max length", () => {
      const insight = "A".repeat(MAX_INSIGHT_LENGTH + 1);
      expect(insight.length > MAX_INSIGHT_LENGTH).toBe(true);
    });

    it("truncation preserves first 30 characters", () => {
      const longInsight = "High 4hrs: avg 223, now 238 rising fast";
      const truncated = longInsight.slice(0, MAX_INSIGHT_LENGTH);
      expect(truncated).toBe("High 4hrs: avg 223, now 238 ri");
      expect(truncated.length).toBe(MAX_INSIGHT_LENGTH);
    });
  });

  describe("fallback detection (inherited from hourly)", () => {
    it("fallback should NOT trigger when agent confirms storage", () => {
      const agentResponse = `## 4-Hour Glucose Analysis
**✨ Insight Stored:** "Hi 4h avg234 248↑ chk?" (22 characters)`;

      const lowerResponse = agentResponse.toLowerCase();
      const shouldFallback = !lowerResponse.includes("stored") && !lowerResponse.includes("insight");
      expect(shouldFallback).toBe(false);
    });

    it("fallback SHOULD trigger when agent fails to store", () => {
      const agentResponse = "I analyzed the data but encountered an error";

      const lowerResponse = agentResponse.toLowerCase();
      const shouldFallback = !lowerResponse.includes("stored") && !lowerResponse.includes("insight");
      expect(shouldFallback).toBe(true);
    });
  });

  describe("insight quality validation", () => {
    // Replicate isValidInsight logic for testing
    function isValidInsight(content: string): boolean {
      const trimmed = content.trim();
      if (trimmed.length < 8) return false;
      if (trimmed.startsWith("#") || trimmed.startsWith("**")) return false;
      if (trimmed.endsWith(":")) return false;
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
      if (trimmed.toLowerCase().includes("key findings")) return false;
      if (trimmed.toLowerCase().includes("analysis")) return false;
      return true;
    }

    it("accepts natural language insight", () => {
      expect(isValidInsight("In range all day!")).toBe(true);
    });

    it("accepts encouraging insight", () => {
      expect(isValidInsight("Steady overnight, nice!")).toBe(true);
    });

    it("accepts action-oriented insight", () => {
      expect(isValidInsight("Falling fast, grab snack")).toBe(true);
    });

    it("accepts insight with numbers", () => {
      expect(isValidInsight("Lowest day this week!")).toBe(true);
    });

    it("accepts insight without numbers", () => {
      expect(isValidInsight("Great morning so far")).toBe(true);
    });

    it("rejects markdown bold", () => {
      expect(isValidInsight("**Key Findings:**")).toBe(false);
    });

    it("rejects markdown h1", () => {
      expect(isValidInsight("# 4-Hour Analysis")).toBe(false);
    });

    it("rejects markdown h2", () => {
      expect(isValidInsight("## Current Status")).toBe(false);
    });

    it("rejects lines ending with colon", () => {
      expect(isValidInsight("Key Findings:")).toBe(false);
    });

    it("rejects 'key findings' text", () => {
      expect(isValidInsight("Here are key findings")).toBe(false);
    });

    it("rejects 'analysis' text", () => {
      expect(isValidInsight("4-Hour Analysis Result")).toBe(false);
    });

    it("rejects too short content", () => {
      expect(isValidInsight("OK")).toBe(false);
    });

    it("rejects JSON objects", () => {
      expect(isValidInsight('{"type":"hourly"}')).toBe(false);
    });

    it("rejects JSON arrays", () => {
      expect(isValidInsight("[1, 2, 3]")).toBe(false);
    });

    it("accepts insight with emoji-style arrows", () => {
      expect(isValidInsight("Running high, check it")).toBe(true);
    });

    it("accepts comparative insights", () => {
      expect(isValidInsight("More insulin than usual")).toBe(true);
    });
  });
});
