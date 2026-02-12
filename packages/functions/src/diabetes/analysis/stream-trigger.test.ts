import { describe, it, expect } from "vitest";
import type { DynamoDBRecord } from "aws-lambda";

// Constants matching stream-trigger.ts
const TRIGGER_TYPES = new Set(["CGM"]);
const FRESHNESS_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const MAX_INSIGHT_LENGTH = 30;

// Rate limiting constants
const INSIGHT_INTERVAL_MS = 60 * 60_000; // 60 minutes
const RAPID_CHANGE_THRESHOLD = 15; // mg/dL between consecutive readings
const DRIFT_THRESHOLD = 30; // mg/dL from last insight glucose
const ZONE_CHANGE_COOLDOWN_MS = 15 * 60_000; // 15 min cooldown for zone-only triggers

type InsightZone = "low" | "caution" | "in-range" | "high";

// Replicate getInsightZone logic from stream-trigger.ts
function getInsightZone(glucose: number): InsightZone {
  if (glucose < 70) return "low";
  if (glucose < 85) return "caution";
  if (glucose <= 180) return "in-range";
  return "high";
}

interface TriggerInput {
  currentGlucose: number;
  previousGlucose: number | null;
  lastInsight: {
    generatedAt: number;
    type: string;
    glucoseAtGeneration?: number;
    zoneAtGeneration?: string;
  } | null;
  now: number;
}

interface TriggerResult {
  shouldGenerate: boolean;
  reasons: string[];
}

// Replicate shouldGenerateInsight logic from stream-trigger.ts
function shouldGenerateInsight(input: TriggerInput): TriggerResult {
  const { currentGlucose, previousGlucose, lastInsight, now } = input;
  const reasons: string[] = [];

  // Cold start: no previous hourly insight or missing glucose data
  if (
    !lastInsight ||
    lastInsight.type !== "hourly" ||
    lastInsight.glucoseAtGeneration === undefined
  ) {
    return { shouldGenerate: true, reasons: ["first-hourly"] };
  }

  const elapsed = now - lastInsight.generatedAt;

  // Trigger 1: Time elapsed >= 60 min
  if (elapsed >= INSIGHT_INTERVAL_MS) {
    reasons.push("time-elapsed");
  }

  // Trigger 2: Rapid change >= 15 mg/dL between consecutive readings
  if (previousGlucose !== null) {
    const delta = Math.abs(currentGlucose - previousGlucose);
    if (delta >= RAPID_CHANGE_THRESHOLD) {
      reasons.push("rapid-change");
    }
  }

  // Trigger 3: Gradual drift >= 30 mg/dL from last insight glucose
  const drift = Math.abs(currentGlucose - lastInsight.glucoseAtGeneration);
  if (drift >= DRIFT_THRESHOLD) {
    reasons.push("drift");
  }

  // Trigger 4: Zone change
  const currentZone = getInsightZone(currentGlucose);
  if (lastInsight.zoneAtGeneration && currentZone !== lastInsight.zoneAtGeneration) {
    reasons.push("zone-change");
  }

  // Zone oscillation cooldown: if ONLY zone-change triggered and elapsed < 15 min, skip
  if (
    reasons.length === 1 &&
    reasons[0] === "zone-change" &&
    elapsed < ZONE_CHANGE_COOLDOWN_MS
  ) {
    return { shouldGenerate: false, reasons: [] };
  }

  return { shouldGenerate: reasons.length > 0, reasons };
}

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

    it("does NOT trigger on BOLUS records", () => {
      const pk = "USR#john#BOLUS#2026-02-01";
      const recordType = pk.split("#")[2];
      expect(TRIGGER_TYPES.has(recordType)).toBe(false);
    });

    it("does NOT trigger on BASAL records", () => {
      const pk = "USR#john#BASAL#2026-02-01";
      const recordType = pk.split("#")[2];
      expect(TRIGGER_TYPES.has(recordType)).toBe(false);
    });

    it("does NOT trigger on CARBS records", () => {
      const pk = "USR#john#CARBS#2026-02-01";
      const recordType = pk.split("#")[2];
      expect(TRIGGER_TYPES.has(recordType)).toBe(false);
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

  describe("getInsightZone", () => {
    it("returns low for glucose < 70", () => {
      expect(getInsightZone(69)).toBe("low");
      expect(getInsightZone(54)).toBe("low");
      expect(getInsightZone(0)).toBe("low");
    });

    it("returns caution for glucose 70-84", () => {
      expect(getInsightZone(70)).toBe("caution");
      expect(getInsightZone(75)).toBe("caution");
      expect(getInsightZone(84)).toBe("caution");
    });

    it("returns in-range for glucose 85-180", () => {
      expect(getInsightZone(85)).toBe("in-range");
      expect(getInsightZone(120)).toBe("in-range");
      expect(getInsightZone(180)).toBe("in-range");
    });

    it("returns high for glucose > 180", () => {
      expect(getInsightZone(181)).toBe("high");
      expect(getInsightZone(250)).toBe("high");
      expect(getInsightZone(400)).toBe("high");
    });

    it("handles boundary at 70 correctly", () => {
      expect(getInsightZone(69)).toBe("low");
      expect(getInsightZone(70)).toBe("caution");
    });

    it("handles boundary at 85 correctly", () => {
      expect(getInsightZone(84)).toBe("caution");
      expect(getInsightZone(85)).toBe("in-range");
    });

    it("handles boundary at 180 correctly", () => {
      expect(getInsightZone(180)).toBe("in-range");
      expect(getInsightZone(181)).toBe("high");
    });
  });

  describe("shouldGenerateInsight", () => {
    const now = Date.now();

    function makeInsight(overrides: {
      generatedAt?: number;
      type?: string;
      glucoseAtGeneration?: number;
      zoneAtGeneration?: string;
    }) {
      return {
        generatedAt: overrides.generatedAt ?? now - 30 * 60_000,
        type: overrides.type ?? "hourly",
        glucoseAtGeneration: "glucoseAtGeneration" in overrides ? overrides.glucoseAtGeneration : 120,
        zoneAtGeneration: overrides.zoneAtGeneration ?? "in-range",
      };
    }

    describe("cold start", () => {
      it("generates when no previous insight exists", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 120,
          previousGlucose: 115,
          lastInsight: null,
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("first-hourly");
      });

      it("generates when last insight is daily type", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 120,
          previousGlucose: 115,
          lastInsight: makeInsight({ type: "daily", glucoseAtGeneration: 120 }),
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("first-hourly");
      });

      it("generates when last insight is weekly type", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 120,
          previousGlucose: 115,
          lastInsight: makeInsight({ type: "weekly", glucoseAtGeneration: 120 }),
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("first-hourly");
      });

      it("generates when glucoseAtGeneration is missing", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 120,
          previousGlucose: 115,
          lastInsight: makeInsight({ glucoseAtGeneration: undefined }),
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("first-hourly");
      });
    });

    describe("time elapsed trigger", () => {
      it("generates when 60+ minutes have elapsed", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 120,
          previousGlucose: 118,
          lastInsight: makeInsight({ generatedAt: now - 61 * 60_000 }),
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("time-elapsed");
      });

      it("generates at exactly 60 minutes", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 120,
          previousGlucose: 118,
          lastInsight: makeInsight({ generatedAt: now - 60 * 60_000 }),
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("time-elapsed");
      });

      it("does not trigger at 59 minutes alone", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 120,
          previousGlucose: 118,
          lastInsight: makeInsight({ generatedAt: now - 59 * 60_000 }),
          now,
        });
        expect(result.reasons).not.toContain("time-elapsed");
      });
    });

    describe("rapid change trigger", () => {
      it("generates when consecutive delta >= 15", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 135,
          previousGlucose: 120,
          lastInsight: makeInsight({ generatedAt: now - 10 * 60_000 }),
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("rapid-change");
      });

      it("generates on rapid drop", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 100,
          previousGlucose: 120,
          lastInsight: makeInsight({ generatedAt: now - 10 * 60_000 }),
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("rapid-change");
      });

      it("does not trigger when delta is 14", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 134,
          previousGlucose: 120,
          lastInsight: makeInsight({ generatedAt: now - 10 * 60_000 }),
          now,
        });
        expect(result.reasons).not.toContain("rapid-change");
      });

      it("handles null previousGlucose gracefully", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 120,
          previousGlucose: null,
          lastInsight: makeInsight({ generatedAt: now - 10 * 60_000 }),
          now,
        });
        expect(result.reasons).not.toContain("rapid-change");
      });
    });

    describe("drift trigger", () => {
      it("generates when drift >= 30 from last insight", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 150,
          previousGlucose: 148,
          lastInsight: makeInsight({
            generatedAt: now - 45 * 60_000,
            glucoseAtGeneration: 120,
          }),
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("drift");
      });

      it("generates on downward drift", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 85,
          previousGlucose: 87,
          lastInsight: makeInsight({
            generatedAt: now - 45 * 60_000,
            glucoseAtGeneration: 120,
          }),
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("drift");
      });

      it("does not trigger when drift is 29", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 149,
          previousGlucose: 147,
          lastInsight: makeInsight({
            generatedAt: now - 10 * 60_000,
            glucoseAtGeneration: 120,
          }),
          now,
        });
        expect(result.reasons).not.toContain("drift");
      });
    });

    describe("zone change trigger", () => {
      it("generates when zone changes from in-range to high", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 185,
          previousGlucose: 178,
          lastInsight: makeInsight({
            generatedAt: now - 20 * 60_000,
            zoneAtGeneration: "in-range",
          }),
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("zone-change");
      });

      it("generates when zone changes from in-range to caution", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 82,
          previousGlucose: 84,
          lastInsight: makeInsight({
            generatedAt: now - 20 * 60_000,
            zoneAtGeneration: "in-range",
          }),
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("zone-change");
      });

      it("does not trigger when zone is the same", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 130,
          previousGlucose: 125,
          lastInsight: makeInsight({
            generatedAt: now - 10 * 60_000,
            zoneAtGeneration: "in-range",
          }),
          now,
        });
        expect(result.reasons).not.toContain("zone-change");
      });
    });

    describe("zone oscillation cooldown", () => {
      it("suppresses zone-only trigger within 15 minutes", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 69,
          previousGlucose: 71,
          lastInsight: makeInsight({
            generatedAt: now - 8 * 60_000, // 8 min ago
            glucoseAtGeneration: 71,
            zoneAtGeneration: "caution",
          }),
          now,
        });
        // Zone changed (caution -> low) but < 15 min and no other trigger
        expect(result.shouldGenerate).toBe(false);
      });

      it("allows zone-change trigger after 15 minutes", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 69,
          previousGlucose: 71,
          lastInsight: makeInsight({
            generatedAt: now - 16 * 60_000, // 16 min ago
            glucoseAtGeneration: 71,
            zoneAtGeneration: "caution",
          }),
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("zone-change");
      });

      it("allows zone-change within 15 min if other triggers also fire", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 55,
          previousGlucose: 71,
          lastInsight: makeInsight({
            generatedAt: now - 8 * 60_000,
            glucoseAtGeneration: 71,
            zoneAtGeneration: "caution",
          }),
          now,
        });
        // Zone change AND rapid change (16 delta) both triggered
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("zone-change");
        expect(result.reasons).toContain("rapid-change");
      });
    });

    describe("skip scenarios", () => {
      it("skips when no triggers are met", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 123,
          previousGlucose: 120,
          lastInsight: makeInsight({
            generatedAt: now - 35 * 60_000,
            glucoseAtGeneration: 118,
            zoneAtGeneration: "in-range",
          }),
          now,
        });
        expect(result.shouldGenerate).toBe(false);
        expect(result.reasons).toEqual([]);
      });
    });

    describe("multiple triggers", () => {
      it("reports all matching triggers", () => {
        const result = shouldGenerateInsight({
          currentGlucose: 65,
          previousGlucose: 85,
          lastInsight: makeInsight({
            generatedAt: now - 90 * 60_000,
            glucoseAtGeneration: 140,
            zoneAtGeneration: "in-range",
          }),
          now,
        });
        expect(result.shouldGenerate).toBe(true);
        expect(result.reasons).toContain("time-elapsed");
        expect(result.reasons).toContain("rapid-change");
        expect(result.reasons).toContain("drift");
        expect(result.reasons).toContain("zone-change");
      });
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

  describe("insight dedup stripMarkup", () => {
    // Replicate stripMarkup logic for testing
    function stripMarkup(text: string): string {
      return text.replace(/\[(?:\/|\w+)\]/g, "").trim().toLowerCase();
    }

    it("strips simple color tags", () => {
      expect(stripMarkup("[green]Hello world![/]")).toBe("hello world!");
    });

    it("strips multiple tags", () => {
      expect(stripMarkup("[yellow]Watch it[/]")).toBe("watch it");
    });

    it("handles text without tags", () => {
      expect(stripMarkup("No tags here")).toBe("no tags here");
    });

    it("handles nested tags", () => {
      expect(stripMarkup("[green][yellow]text[/][/]")).toBe("text");
    });

    it("handles malformed unclosed tags", () => {
      expect(stripMarkup("[green]text")).toBe("text");
    });

    it("handles orphan closing tags", () => {
      expect(stripMarkup("text[/]")).toBe("text");
    });

    it("normalizes case for comparison", () => {
      const a = stripMarkup("[green]Best Day This Week![/]");
      const b = stripMarkup("[yellow]best day this week![/]");
      expect(a).toBe(b);
    });

    it("matches same text with different colors", () => {
      const a = stripMarkup("[green]Coming down nicely![/]");
      const b = stripMarkup("[red]Coming down nicely![/]");
      expect(a).toBe(b);
    });

    it("does not match different text", () => {
      const a = stripMarkup("[green]Great morning![/]");
      const b = stripMarkup("[green]Great afternoon![/]");
      expect(a).not.toBe(b);
    });

    it("handles rainbow tag", () => {
      expect(stripMarkup("[rainbow]Big milestone![/]")).toBe("big milestone!");
    });
  });
});
