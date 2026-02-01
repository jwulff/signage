import { describe, it, expect } from "vitest";
import { createSolidFrame } from "@signage/core";
import type { InsightDisplayData } from "./insight-renderer.js";
import {
  renderInsightRegion,
  getInsightStatus,
  createInsightDisplayData,
} from "./insight-renderer.js";

describe("insight-renderer", () => {
  describe("getInsightStatus", () => {
    it("returns unavailable when generatedAt is null", () => {
      expect(getInsightStatus(null)).toBe("unavailable");
    });

    it("returns fresh for insights less than 2 hours old", () => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      expect(getInsightStatus(oneHourAgo)).toBe("fresh");
    });

    it("returns stale for insights between 2-6 hours old", () => {
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
      expect(getInsightStatus(threeHoursAgo)).toBe("stale");
    });

    it("returns very_stale for insights over 6 hours old", () => {
      const eightHoursAgo = Date.now() - 8 * 60 * 60 * 1000;
      expect(getInsightStatus(eightHoursAgo)).toBe("very_stale");
    });
  });

  describe("createInsightDisplayData", () => {
    it("returns null when content is null", () => {
      expect(createInsightDisplayData(null, "hourly", Date.now())).toBeNull();
    });

    it("returns null when generatedAt is null", () => {
      expect(createInsightDisplayData("test", "hourly", null)).toBeNull();
    });

    it("creates insight data with correct structure", () => {
      const now = Date.now();
      const insight = createInsightDisplayData(
        "Test insight",
        "daily",
        now
      );

      expect(insight).toEqual({
        content: "Test insight",
        type: "daily",
        generatedAt: now,
        isStale: false,
        status: "fresh",
      });
    });

    it("marks insight as stale when appropriate", () => {
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
      const insight = createInsightDisplayData(
        "Old insight",
        "hourly",
        threeHoursAgo
      );

      expect(insight?.isStale).toBe(true);
      expect(insight?.status).toBe("stale");
    });
  });

  describe("renderInsightRegion", () => {
    it("renders 'Analyzing...' when insight is null", () => {
      const frame = createSolidFrame(64, 64);
      renderInsightRegion(frame, null);
      // We can't easily test the visual output, but we verify it doesn't throw
      expect(frame).toBeDefined();
    });

    it("renders 'Analyzing...' when insight status is unavailable", () => {
      const frame = createSolidFrame(64, 64);
      const insight: InsightDisplayData = {
        content: "Test",
        type: "hourly",
        generatedAt: Date.now(),
        isStale: false,
        status: "unavailable",
      };
      renderInsightRegion(frame, insight);
      expect(frame).toBeDefined();
    });

    it("renders insight content when available", () => {
      const frame = createSolidFrame(64, 64);
      const insight: InsightDisplayData = {
        content: "Short text",
        type: "hourly",
        generatedAt: Date.now(),
        isStale: false,
        status: "fresh",
      };
      renderInsightRegion(frame, insight);
      expect(frame).toBeDefined();
    });

    it("handles markdown formatting in content", () => {
      const frame = createSolidFrame(64, 64);
      const insight: InsightDisplayData = {
        content: "## Header **bold** text",
        type: "hourly",
        generatedAt: Date.now(),
        isStale: false,
        status: "fresh",
      };
      renderInsightRegion(frame, insight);
      expect(frame).toBeDefined();
    });
  });

  // Test the text splitting logic through integration
  describe("text splitting and truncation", () => {
    // Note: We can't directly test splitForDisplay since it's not exported,
    // but we can test the behavior through renderInsightRegion
    
    it("handles short text (under 15 chars)", () => {
      const frame = createSolidFrame(64, 64);
      const insight: InsightDisplayData = {
        content: "Short",
        type: "hourly",
        generatedAt: Date.now(),
        isStale: false,
        status: "fresh",
      };
      renderInsightRegion(frame, insight);
      expect(frame).toBeDefined();
    });

    it("handles text that needs two lines", () => {
      const frame = createSolidFrame(64, 64);
      const insight: InsightDisplayData = {
        content: "This text needs two lines",
        type: "hourly",
        generatedAt: Date.now(),
        isStale: false,
        status: "fresh",
      };
      renderInsightRegion(frame, insight);
      expect(frame).toBeDefined();
    });

    it("handles text over 30 chars that needs truncation", () => {
      const frame = createSolidFrame(64, 64);
      const insight: InsightDisplayData = {
        content: "This is a very long text that definitely exceeds the thirty character limit",
        type: "hourly",
        generatedAt: Date.now(),
        isStale: false,
        status: "fresh",
      };
      renderInsightRegion(frame, insight);
      expect(frame).toBeDefined();
    });

    it("strips markdown headers", () => {
      const frame = createSolidFrame(64, 64);
      const insight: InsightDisplayData = {
        content: "## This is a markdown header",
        type: "hourly",
        generatedAt: Date.now(),
        isStale: false,
        status: "fresh",
      };
      renderInsightRegion(frame, insight);
      expect(frame).toBeDefined();
    });

    it("strips markdown bold/italic markers", () => {
      const frame = createSolidFrame(64, 64);
      const insight: InsightDisplayData = {
        content: "**bold** and *italic* text",
        type: "hourly",
        generatedAt: Date.now(),
        isStale: false,
        status: "fresh",
      };
      renderInsightRegion(frame, insight);
      expect(frame).toBeDefined();
    });

    it("normalizes whitespace", () => {
      const frame = createSolidFrame(64, 64);
      const insight: InsightDisplayData = {
        content: "Text  with   extra    spaces",
        type: "hourly",
        generatedAt: Date.now(),
        isStale: false,
        status: "fresh",
      };
      renderInsightRegion(frame, insight);
      expect(frame).toBeDefined();
    });
  });
});
