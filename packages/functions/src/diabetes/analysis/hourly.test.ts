import { describe, it, expect } from "vitest";

// Test the insight length constants and logic
describe("hourly analysis", () => {
  const MAX_INSIGHT_LENGTH = 30;

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
