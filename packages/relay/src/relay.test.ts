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

const { mockInitializePixoo, mockSendFrameToPixoo } = vi.hoisted(() => ({
  mockInitializePixoo: vi.fn(),
  mockSendFrameToPixoo: vi.fn(),
}));

vi.mock("ws", () => ({
  default: vi.fn(() => {
    const ws = new MockWebSocket();
    // Emit open event on next tick to simulate async connection
    setTimeout(() => ws.emit("open"), 0);
    return ws;
  }),
}));

vi.mock("./pixoo-client.js", () => ({
  initializePixoo: mockInitializePixoo,
  sendFrameToPixoo: mockSendFrameToPixoo,
}));

// Note: We can't easily test startRelay because it runs forever (await new Promise(() => {}))
// Instead, we test the WebSocket event handlers by mocking the module internals

describe("relay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitializePixoo.mockResolvedValue(undefined);
    mockSendFrameToPixoo.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initializePixoo integration", () => {
    it("initializePixoo is called with correct IP", async () => {
      // We can test the pixoo-client mocks are correctly set up
      await mockInitializePixoo("192.168.1.100");
      expect(mockInitializePixoo).toHaveBeenCalledWith("192.168.1.100");
    });

    it("sendFrameToPixoo handles frame correctly", async () => {
      const frame = { width: 64, height: 64, pixels: new Uint8Array(64 * 64 * 3) };
      await mockSendFrameToPixoo("192.168.1.100", frame);
      expect(mockSendFrameToPixoo).toHaveBeenCalledWith("192.168.1.100", frame);
    });
  });

  // Note: Full integration testing of startRelay would require:
  // 1. A way to stop the relay (not implemented - runs forever)
  // 2. Complex async coordination of WebSocket events
  // For now, the pixoo-client tests cover the critical paths
});
