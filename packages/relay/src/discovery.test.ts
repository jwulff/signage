import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadConfig,
  saveConfig,
  getSavedPixooIp,
  savePixooIp,
} from "./discovery";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

// Mock fs
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe("config persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadConfig", () => {
    it("returns empty object when file doesn't exist", () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const config = loadConfig();
      expect(config).toEqual({});
    });

    it("parses config from file", () => {
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ pixooIp: "192.168.1.100" })
      );

      const config = loadConfig();
      expect(config.pixooIp).toBe("192.168.1.100");
    });

    it("returns empty object on parse error", () => {
      vi.mocked(readFileSync).mockReturnValue("invalid json");

      const config = loadConfig();
      expect(config).toEqual({});
    });
  });

  describe("saveConfig", () => {
    it("creates directory and writes file", () => {
      saveConfig({ pixooIp: "192.168.1.100" });

      expect(mkdirSync).toHaveBeenCalled();
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("config.json"),
        expect.stringContaining("192.168.1.100")
      );
    });
  });

  describe("getSavedPixooIp", () => {
    it("returns undefined when no IP saved", () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      expect(getSavedPixooIp()).toBeUndefined();
    });

    it("returns saved IP", () => {
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ pixooIp: "192.168.1.100" })
      );

      expect(getSavedPixooIp()).toBe("192.168.1.100");
    });
  });

  describe("savePixooIp", () => {
    it("saves IP to config", () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}));

      savePixooIp("192.168.1.100");

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("192.168.1.100")
      );
    });
  });
});
