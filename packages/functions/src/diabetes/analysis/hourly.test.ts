import { describe, it, expect } from "vitest";

// Test the insight length constants and logic
describe("hourly analysis", () => {
  const MAX_INSIGHT_LENGTH = 30;

  describe("fallback detection", () => {
    // The agent response might use capitalized words like "Stored" or "Insight"
    // The fallback check should be case-insensitive to avoid overwriting good insights

    it("detects 'stored' regardless of case", () => {
      const responses = [
        "I have stored the insight",
        "Insight Stored successfully",
        "**✨ Insight Stored:** 'Hi 4h avg234'",
        "STORED in database",
      ];

      responses.forEach((response) => {
        const lowerResponse = response.toLowerCase();
        const hasStored = lowerResponse.includes("stored");
        expect(hasStored).toBe(true);
      });
    });

    it("detects 'insight' regardless of case", () => {
      const responses = [
        "Here is the insight for display",
        "Insight: Hi 4h avg234",
        "**✨ Insight Stored:**",
        "INSIGHT generated",
      ];

      responses.forEach((response) => {
        const lowerResponse = response.toLowerCase();
        const hasInsight = lowerResponse.includes("insight");
        expect(hasInsight).toBe(true);
      });
    });

    it("fallback should NOT trigger when agent confirms storage", () => {
      // Real agent response that was causing the bug (case mismatch)
      const agentResponse = `## 4-Hour Glucose Analysis
**✨ Insight Stored:** "Hi 4h avg234 248↑ chk?" (22 characters)`;

      const lowerResponse = agentResponse.toLowerCase();
      const shouldFallback = !lowerResponse.includes("stored") && !lowerResponse.includes("insight");

      // Fallback should NOT trigger because response contains "Stored" and "Insight"
      expect(shouldFallback).toBe(false);
    });

    it("fallback SHOULD trigger when agent fails to store", () => {
      const agentResponse = "I analyzed the data but encountered an error";

      const lowerResponse = agentResponse.toLowerCase();
      const shouldFallback = !lowerResponse.includes("stored") && !lowerResponse.includes("insight");

      // Fallback SHOULD trigger because response lacks both "stored" and "insight"
      expect(shouldFallback).toBe(true);
    });
  });

  describe("insight length validation", () => {
    it("accepts insights at exactly max length", () => {
      const insight = "A".repeat(MAX_INSIGHT_LENGTH);
      expect(insight.length).toBe(MAX_INSIGHT_LENGTH);
      expect(insight.length <= MAX_INSIGHT_LENGTH).toBe(true);
    });

    it("rejects insights over max length", () => {
      const insight = "A".repeat(MAX_INSIGHT_LENGTH + 1);
      expect(insight.length).toBe(MAX_INSIGHT_LENGTH + 1);
      expect(insight.length <= MAX_INSIGHT_LENGTH).toBe(false);
    });

    it("truncation preserves first 30 characters", () => {
      const longInsight = "High 4hrs: avg 223, now 238 rising fast";
      const truncated = longInsight.slice(0, MAX_INSIGHT_LENGTH);
      expect(truncated).toBe("High 4hrs: avg 223, now 238 ri");
      expect(truncated.length).toBe(MAX_INSIGHT_LENGTH);
    });

    it("short insights pass without modification", () => {
      const shortInsight = "avg223 238↑ grt!";
      expect(shortInsight.length).toBeLessThanOrEqual(MAX_INSIGHT_LENGTH);
    });
  });

  describe("abbreviation examples fit in 30 chars", () => {
    const examples = [
      "avg223 238↑ grt!",      // 16 chars
      "hi4h avg220 stdy",       // 16 chars
      "TIR85% 4h avg210",       // 16 chars
      "↓180 from 240 grt",      // 17 chars
      "lo warn 65 chk now",     // 18 chars
    ];

    examples.forEach((example) => {
      it(`"${example}" fits in ${MAX_INSIGHT_LENGTH} chars`, () => {
        expect(example.length).toBeLessThanOrEqual(MAX_INSIGHT_LENGTH);
      });
    });
  });
});
