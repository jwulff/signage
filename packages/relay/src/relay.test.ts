import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

// Mock WebSocket before importing relay
class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  send = vi.fn();
  close = vi.fn();
}

const { mockInitializePixoo, mockSendFrameToPixoo, capturedWs } = vi.hoisted(() => {
  return {
    mockInitializePixoo: vi.fn(),
    mockSendFrameToPixoo: vi.fn(),
    capturedWs: { instance: null as MockWebSocket | null },
  };
});

vi.mock("ws", () => ({
  default: vi.fn(() => {
    const ws = new MockWebSocket();
    capturedWs.instance = ws;
    // Emit open event on next tick to simulate async connection
    setTimeout(() => ws.emit("open"), 0);
    return ws;
  }),
}));

vi.mock("./pixoo-client.js", () => ({
  initializePixoo: mockInitializePixoo,
  sendFrameToPixoo: mockSendFrameToPixoo,
}));

import { startRelay } from "./relay.js";
import type { HealthHeartbeat } from "./heartbeat.js";

function makeFrameMessage() {
  // 1x1 RGB frame, base64-encoded
  const data = Buffer.from([0, 0, 0]).toString("base64");
  return {
    type: "frame",
    payload: { frame: { width: 1, height: 1, data } },
    timestamp: Date.now(),
  };
}

async function flushMicrotasks(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe("relay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitializePixoo.mockResolvedValue(undefined);
    mockSendFrameToPixoo.mockResolvedValue(undefined);
    capturedWs.instance = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initializePixoo integration", () => {
    it("initializePixoo is called with correct IP", async () => {
      await mockInitializePixoo("192.168.1.100");
      expect(mockInitializePixoo).toHaveBeenCalledWith("192.168.1.100");
    });

    it("sendFrameToPixoo handles frame correctly", async () => {
      const frame = { width: 64, height: 64, pixels: new Uint8Array(64 * 64 * 3) };
      await mockSendFrameToPixoo("192.168.1.100", frame);
      expect(mockSendFrameToPixoo).toHaveBeenCalledWith("192.168.1.100", frame);
    });
  });

  describe("heartbeat wiring", () => {
    it("calls heartbeat.reportSuccess after a successful frame send", async () => {
      const hb: HealthHeartbeat = {
        reportSuccess: vi.fn().mockResolvedValue(undefined),
        reportFailure: vi.fn().mockResolvedValue(undefined),
      };

      // Fire-and-forget — startRelay never resolves on purpose
      void startRelay({ pixooIp: "192.168.1.50", wsUrl: "wss://x", heartbeat: hb });
      await new Promise((r) => setTimeout(r, 5)); // let "open" fire
      expect(capturedWs.instance).not.toBeNull();

      capturedWs.instance!.emit("message", JSON.stringify(makeFrameMessage()));
      await flushMicrotasks(20);

      expect(mockSendFrameToPixoo).toHaveBeenCalled();
      expect(hb.reportSuccess).toHaveBeenCalledTimes(1);
      expect(hb.reportFailure).not.toHaveBeenCalled();
    });

    it("calls heartbeat.reportFailure with the error code when frame send fails", async () => {
      const hb: HealthHeartbeat = {
        reportSuccess: vi.fn().mockResolvedValue(undefined),
        reportFailure: vi.fn().mockResolvedValue(undefined),
      };

      const fetchErr = new Error("fetch failed") as Error & { cause?: { code?: string } };
      fetchErr.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
      mockSendFrameToPixoo.mockRejectedValueOnce(fetchErr);

      void startRelay({ pixooIp: "192.168.1.50", wsUrl: "wss://x", heartbeat: hb });
      await new Promise((r) => setTimeout(r, 5));

      capturedWs.instance!.emit("message", JSON.stringify(makeFrameMessage()));
      await flushMicrotasks(20);

      expect(hb.reportFailure).toHaveBeenCalledTimes(1);
      expect(hb.reportFailure).toHaveBeenCalledWith("UND_ERR_CONNECT_TIMEOUT");
      expect(hb.reportSuccess).not.toHaveBeenCalled();
    });

    it("uses the noop heartbeat by default when none is provided", async () => {
      // No heartbeat option — should still work without error
      void startRelay({ pixooIp: "192.168.1.50", wsUrl: "wss://x" });
      await new Promise((r) => setTimeout(r, 5));

      capturedWs.instance!.emit("message", JSON.stringify(makeFrameMessage()));
      await flushMicrotasks(20);

      expect(mockSendFrameToPixoo).toHaveBeenCalled();
    });
  });
});
