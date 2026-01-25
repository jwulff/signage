import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "./useWebSocket";

// Store the mock class constructor calls
let mockWebSocketInstances: MockWebSocket[] = [];

// Mock WebSocket class
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((this: WebSocket, ev: Event) => void) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => void) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => void) | null = null;
  onerror: ((this: WebSocket, ev: Event) => void) | null = null;

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose.call(this as unknown as WebSocket, new CloseEvent("close"));
    }
  });

  constructor(url: string) {
    this.url = url;
    mockWebSocketInstances.push(this);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen.call(this as unknown as WebSocket, new Event("open"));
    }
  }

  simulateMessage(data: unknown) {
    if (this.onmessage) {
      const event = new MessageEvent("message", { data: JSON.stringify(data) });
      this.onmessage.call(this as unknown as WebSocket, event);
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror.call(this as unknown as WebSocket, new Event("error"));
    }
  }
}

// Mock global WebSocket before each test
const OriginalWebSocket = globalThis.WebSocket;

describe("useWebSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockWebSocketInstances = [];
    // @ts-expect-error - replacing WebSocket with mock
    globalThis.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = OriginalWebSocket;
  });

  const getLastInstance = () => mockWebSocketInstances[mockWebSocketInstances.length - 1];

  it("starts disconnected when no URL provided", () => {
    const { result } = renderHook(() => useWebSocket(undefined));

    expect(result.current.status).toBe("disconnected");
    expect(result.current.connected).toBe(false);
    expect(result.current.frame).toBeNull();
  });

  it("connects to WebSocket when URL provided", () => {
    renderHook(() => useWebSocket("wss://test.example.com"));

    expect(mockWebSocketInstances.length).toBe(1);
    expect(getLastInstance().url).toBe("wss://test.example.com");
  });

  it("sets status to connecting initially", () => {
    const { result } = renderHook(() => useWebSocket("wss://test.example.com"));

    expect(result.current.status).toBe("connecting");
  });

  it("sets status to connected when WebSocket opens", () => {
    const { result } = renderHook(() => useWebSocket("wss://test.example.com"));

    act(() => {
      getLastInstance().simulateOpen();
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.connected).toBe(true);
  });

  it("sends registration message on connect", () => {
    renderHook(() => useWebSocket("wss://test.example.com"));

    act(() => {
      getLastInstance().simulateOpen();
    });

    expect(getLastInstance().send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"connect"')
    );
  });

  it("updates frame when receiving frame message", () => {
    const { result } = renderHook(() => useWebSocket("wss://test.example.com"));

    act(() => {
      getLastInstance().simulateOpen();
    });

    // Send a frame message with base64-encoded RGB data (2 pixels: red, green)
    const rgbData = new Uint8Array([255, 0, 0, 0, 255, 0]);
    const base64Data = btoa(String.fromCharCode(...rgbData));

    act(() => {
      getLastInstance().simulateMessage({
        type: "frame",
        payload: {
          frame: {
            width: 2,
            height: 1,
            data: base64Data,
          },
        },
        timestamp: Date.now(),
      });
    });

    expect(result.current.frame).not.toBeNull();
    expect(result.current.frame?.length).toBe(6);
    expect(result.current.frame?.[0]).toBe(255); // Red channel
  });

  it("responds with pong when receiving ping", () => {
    renderHook(() => useWebSocket("wss://test.example.com"));

    act(() => {
      getLastInstance().simulateOpen();
    });

    // Clear the registration message
    getLastInstance().send.mockClear();

    act(() => {
      getLastInstance().simulateMessage({
        type: "ping",
        payload: {},
        timestamp: Date.now(),
      });
    });

    expect(getLastInstance().send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"pong"')
    );
  });

  it("sets status to disconnected when WebSocket closes", () => {
    const { result } = renderHook(() => useWebSocket("wss://test.example.com"));

    act(() => {
      getLastInstance().simulateOpen();
    });

    expect(result.current.status).toBe("connected");

    act(() => {
      getLastInstance().close();
    });

    expect(result.current.status).toBe("disconnected");
  });

  it("attempts reconnect with exponential backoff after disconnect", () => {
    renderHook(() => useWebSocket("wss://test.example.com"));

    const initialCount = mockWebSocketInstances.length;

    act(() => {
      getLastInstance().simulateOpen();
    });

    // Simulate connection close (not intentional)
    act(() => {
      const ws = getLastInstance();
      ws.readyState = MockWebSocket.CLOSED;
      if (ws.onclose) {
        ws.onclose.call(ws as unknown as WebSocket, new CloseEvent("close"));
      }
    });

    expect(mockWebSocketInstances.length).toBe(initialCount);

    // Advance timer past initial backoff (1000ms)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockWebSocketInstances.length).toBe(initialCount + 1);
  });

  it("cleans up WebSocket on unmount", () => {
    const { unmount } = renderHook(() => useWebSocket("wss://test.example.com"));

    act(() => {
      getLastInstance().simulateOpen();
    });

    const ws = getLastInstance();
    unmount();

    expect(ws.close).toHaveBeenCalled();
  });

  it("does not reconnect on intentional close (unmount)", () => {
    const { unmount } = renderHook(() => useWebSocket("wss://test.example.com"));

    act(() => {
      getLastInstance().simulateOpen();
    });

    const countBefore = mockWebSocketInstances.length;
    unmount();

    // Advance timers past any reconnect delay
    act(() => {
      vi.advanceTimersByTime(35000);
    });

    // Should not have created new connections
    expect(mockWebSocketInstances.length).toBe(countBefore);
  });

  it("handles invalid JSON gracefully", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderHook(() => useWebSocket("wss://test.example.com"));

    act(() => {
      getLastInstance().simulateOpen();
    });

    // Send invalid JSON directly
    act(() => {
      const ws = getLastInstance();
      if (ws.onmessage) {
        const event = new MessageEvent("message", { data: "not valid json" });
        ws.onmessage.call(ws as unknown as WebSocket, event);
      }
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "Error processing message:",
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it("ignores unknown message types", () => {
    const { result } = renderHook(() => useWebSocket("wss://test.example.com"));

    act(() => {
      getLastInstance().simulateOpen();
    });

    const frameBefore = result.current.frame;

    act(() => {
      getLastInstance().simulateMessage({
        type: "unknown",
        payload: {},
        timestamp: Date.now(),
      });
    });

    expect(result.current.frame).toBe(frameBefore);
  });
});
