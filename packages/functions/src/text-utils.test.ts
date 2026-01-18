import { describe, it, expect } from "vitest";
import { wrapText, truncateText } from "./text-utils";

describe("wrapText", () => {
  it("returns single line when text fits", () => {
    expect(wrapText("hello", 10)).toEqual(["hello"]);
  });

  it("wraps at word boundaries", () => {
    expect(wrapText("hello world", 6)).toEqual(["hello", "world"]);
  });

  it("handles multiple words per line", () => {
    expect(wrapText("a b c d e f", 5)).toEqual(["a b c", "d e f"]);
  });

  it("breaks long words that exceed max width", () => {
    expect(wrapText("supercalifragilistic", 10)).toEqual([
      "supercalif",
      "ragilistic",
    ]);
  });

  it("handles mixed long and short words", () => {
    expect(wrapText("hi supercalifragilistic bye", 10)).toEqual([
      "hi",
      "supercalif",
      "ragilistic",
      "bye",
    ]);
  });

  it("handles empty string", () => {
    expect(wrapText("", 10)).toEqual([""]);
  });

  it("trims whitespace from lines", () => {
    expect(wrapText("  hello   world  ", 10)).toEqual(["hello", "world"]);
  });

  it("handles single character max width", () => {
    expect(wrapText("abc", 1)).toEqual(["a", "b", "c"]);
  });
});

describe("truncateText", () => {
  it("returns text unchanged when within limit", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("truncates with ellipsis when over limit", () => {
    expect(truncateText("hello world", 8)).toBe("hello...");
  });

  it("handles exact length", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });

  it("handles very short max length", () => {
    expect(truncateText("hello", 3)).toBe("...");
  });

  it("handles empty string", () => {
    expect(truncateText("", 10)).toBe("");
  });
});
