/**
 * Tests for getRecentInsightContents
 */

import { describe, it, expect, vi } from "vitest";
import { getRecentInsightContents } from "./insights.js";

function mockDocClient(items: Array<{ content: string }>) {
  return {
    send: vi.fn().mockResolvedValue({ Items: items }),
  } as any;
}

describe("getRecentInsightContents", () => {
  it("returns content strings from query results", async () => {
    const client = mockDocClient([
      { content: "Steady at 120" },
      { content: "Best day this week!" },
    ]);

    const result = await getRecentInsightContents(client, "TestTable", "john", 6);

    expect(result).toEqual(["Steady at 120", "Best day this week!"]);
  });

  it("returns empty array when no results", async () => {
    const client = mockDocClient([]);
    const result = await getRecentInsightContents(client, "TestTable", "john", 6);
    expect(result).toEqual([]);
  });

  it("queries with correct pk for user", async () => {
    const client = mockDocClient([]);
    await getRecentInsightContents(client, "TestTable", "john", 6);

    const call = client.send.mock.calls[0][0];
    expect(call.input.ExpressionAttributeValues[":pk"]).toBe(
      "USR#john#INSIGHT#HISTORY"
    );
  });

  it("uses ProjectionExpression to fetch only content", async () => {
    const client = mockDocClient([]);
    await getRecentInsightContents(client, "TestTable", "john", 6);

    const call = client.send.mock.calls[0][0];
    expect(call.input.ProjectionExpression).toBe("content");
  });

  it("calculates time range based on hours parameter", async () => {
    const client = mockDocClient([]);
    const before = Date.now();
    await getRecentInsightContents(client, "TestTable", "john", 6);
    const after = Date.now();

    const call = client.send.mock.calls[0][0];
    const startTs = parseInt(call.input.ExpressionAttributeValues[":start"], 10);
    const endTs = parseInt(call.input.ExpressionAttributeValues[":end"], 10);

    // endTs should be approximately now
    expect(endTs).toBeGreaterThanOrEqual(before);
    expect(endTs).toBeLessThanOrEqual(after);

    // startTs should be ~6 hours before endTs
    const sixHoursMs = 6 * 60 * 60 * 1000;
    expect(endTs - startTs).toBeGreaterThanOrEqual(sixHoursMs - 100);
    expect(endTs - startTs).toBeLessThanOrEqual(sixHoursMs + 100);
  });

  it("handles undefined Items gracefully", async () => {
    const client = {
      send: vi.fn().mockResolvedValue({ Items: undefined }),
    } as any;

    const result = await getRecentInsightContents(client, "TestTable", "john", 6);
    expect(result).toEqual([]);
  });
});
