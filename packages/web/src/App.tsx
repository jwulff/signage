import { PixelDisplay } from "./components/PixelDisplay";
import { useWebSocket, type ConnectionStatus } from "./hooks/useWebSocket";

const statusConfig: Record<ConnectionStatus, { text: string; color: string }> = {
  connected: { text: "Connected", color: "#4ade80" },
  connecting: { text: "Connecting...", color: "#facc15" },
  disconnected: { text: "Disconnected - Reconnecting...", color: "#f87171" },
};

export function App() {
  const wsUrl = import.meta.env.VITE_WEBSOCKET_URL;
  const { frame, status } = useWebSocket(wsUrl);
  const { text, color } = statusConfig[status];

  return (
    <div style={{ textAlign: "center", color: "#fff" }}>
      <h1 style={{ marginBottom: "20px", fontSize: "24px", fontWeight: 300 }}>
        Signage Emulator
      </h1>
      <PixelDisplay width={64} height={64} frame={frame} pixelSize={8} />
      <p style={{ marginTop: "20px", fontSize: "14px", color, opacity: 0.9 }}>
        {text}
      </p>
    </div>
  );
}
