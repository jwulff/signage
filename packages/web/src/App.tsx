import { PixelDisplay } from "./components/PixelDisplay";
import { useWebSocket } from "./hooks/useWebSocket";

export function App() {
  const wsUrl = import.meta.env.VITE_WEBSOCKET_URL;
  const { frame, connected } = useWebSocket(wsUrl);

  return (
    <div style={{ textAlign: "center", color: "#fff" }}>
      <h1 style={{ marginBottom: "20px", fontSize: "24px", fontWeight: 300 }}>
        Signage Emulator
      </h1>
      <PixelDisplay width={64} height={64} frame={frame} pixelSize={8} />
      <p style={{ marginTop: "20px", fontSize: "14px", opacity: 0.7 }}>
        {connected ? "Connected" : "Connecting..."}
      </p>
    </div>
  );
}
