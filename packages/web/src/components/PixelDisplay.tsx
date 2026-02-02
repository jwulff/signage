import { useEffect, useRef } from "react";

interface PixelDisplayProps {
  width: number;
  height: number;
  frame: Uint8Array | null;
  pixelSize?: number;
}

/**
 * Canvas-based pixel display component
 * Renders a grid of pixels from RGB frame data
 */
export function PixelDisplay({
  width,
  height,
  frame,
  pixelSize = 8,
}: PixelDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!frame) return;

    // Draw pixels
    const imageData = ctx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const srcOffset = i * 3;
      const dstOffset = i * 4;
      imageData.data[dstOffset] = frame[srcOffset]; // R
      imageData.data[dstOffset + 1] = frame[srcOffset + 1]; // G
      imageData.data[dstOffset + 2] = frame[srcOffset + 2]; // B
      imageData.data[dstOffset + 3] = 255; // A
    }

    // Scale up using nearest neighbor
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.putImageData(imageData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);

    // Draw grid lines (black pixel outlines)
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * pixelSize, 0);
      ctx.lineTo(x * pixelSize, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * pixelSize);
      ctx.lineTo(canvas.width, y * pixelSize);
      ctx.stroke();
    }
  }, [width, height, frame, pixelSize]);

  return (
    <canvas
      ref={canvasRef}
      width={width * pixelSize}
      height={height * pixelSize}
      style={{
        border: "2px solid #333",
        borderRadius: "4px",
        boxShadow: "0 0 20px rgba(0, 0, 0, 0.5)",
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "calc(100vw - 32px)",
        width: "auto",
        height: "auto",
        imageRendering: "pixelated",
      }}
    />
  );
}
