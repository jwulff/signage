import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  initializePixoo,
  sendFrameToPixoo,
  sendPixooCommand,
} from "./pixoo-client";
import type { Frame } from "@signage/core";

describe("pixoo-client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe("initializePixoo", () => {
    it("switches to channel 4 and resets GIF state", async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true }) // Channel switch
        .mockResolvedValueOnce({ ok: true }); // GIF reset

      await initializePixoo("192.168.1.100");

      expect(fetchMock).toHaveBeenCalledTimes(2);

      // First call: channel switch
      const [url1, options1] = fetchMock.mock.calls[0];
      expect(url1).toBe("http://192.168.1.100:80/post");
      expect(JSON.parse(options1.body)).toEqual({
        Command: "Channel/SetIndex",
        SelectIndex: 4,
      });

      // Second call: GIF reset
      const [url2, options2] = fetchMock.mock.calls[1];
      expect(url2).toBe("http://192.168.1.100:80/post");
      expect(JSON.parse(options2.body)).toEqual({
        Command: "Draw/ResetHttpGifId",
      });
    });

    it("throws on channel switch failure", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(initializePixoo("192.168.1.100")).rejects.toThrow(
        "Pixoo channel switch failed: 500"
      );
    });

    it("throws on GIF reset failure", async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true }) // Channel switch succeeds
        .mockResolvedValueOnce({ ok: false, status: 500 }); // GIF reset fails

      await expect(initializePixoo("192.168.1.100")).rejects.toThrow(
        "Pixoo GIF reset failed: 500"
      );
    });
  });

  describe("sendFrameToPixoo", () => {
    const mockFrame: Frame = {
      width: 64,
      height: 64,
      pixels: new Uint8Array(64 * 64 * 3).fill(0),
    };

    it("resets GIF state and sends frame", async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true }) // GIF reset
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ error_code: 0 }),
        }); // Frame send

      await sendFrameToPixoo("192.168.1.100", mockFrame);

      expect(fetchMock).toHaveBeenCalledTimes(2);

      // First call: GIF reset
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        Command: "Draw/ResetHttpGifId",
      });

      // Second call: frame command
      const frameCommand = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(frameCommand.Command).toBe("Draw/SendHttpGif");
      expect(frameCommand.PicWidth).toBe(64);
    });

    it("throws on HTTP failure", async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true }) // GIF reset
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        });

      await expect(sendFrameToPixoo("192.168.1.100", mockFrame)).rejects.toThrow(
        "Pixoo request failed: 500 Internal Server Error"
      );
    });

    it("throws on Pixoo error code", async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true }) // GIF reset
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ error_code: 1, error: "Some error" }),
        });

      await expect(sendFrameToPixoo("192.168.1.100", mockFrame)).rejects.toThrow(
        "Pixoo error:"
      );
    });
  });

  describe("sendPixooCommand", () => {
    it("sends command and returns response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await sendPixooCommand("192.168.1.100", {
        Command: "Device/GetTime",
      });

      expect(result).toEqual({ success: true });

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("http://192.168.1.100:80/post");
      expect(JSON.parse(options.body)).toEqual({
        Command: "Device/GetTime",
      });
    });

    it("throws on HTTP failure", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        sendPixooCommand("192.168.1.100", { Command: "Invalid" })
      ).rejects.toThrow("Pixoo request failed: 404 Not Found");
    });
  });
});
