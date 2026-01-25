import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { PixelDisplay } from "./PixelDisplay";
import { mockCanvasContext } from "../test-setup";

describe("PixelDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders canvas with correct dimensions", () => {
    const { container } = render(
      <PixelDisplay width={64} height={64} frame={null} pixelSize={8} />
    );

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.width).toBe(64 * 8); // 512
    expect(canvas?.height).toBe(64 * 8); // 512
  });

  it("applies default pixelSize of 8", () => {
    const { container } = render(
      <PixelDisplay width={64} height={64} frame={null} />
    );

    const canvas = container.querySelector("canvas");
    expect(canvas?.width).toBe(512);
    expect(canvas?.height).toBe(512);
  });

  it("clears canvas with black fill", () => {
    render(<PixelDisplay width={64} height={64} frame={null} pixelSize={8} />);

    expect(mockCanvasContext.fillRect).toHaveBeenCalledWith(0, 0, 512, 512);
  });

  it("does not draw pixels when frame is null", () => {
    render(<PixelDisplay width={64} height={64} frame={null} pixelSize={8} />);

    expect(mockCanvasContext.createImageData).not.toHaveBeenCalled();
    expect(mockCanvasContext.drawImage).not.toHaveBeenCalled();
  });

  it("creates ImageData with correct dimensions when frame provided", () => {
    const frame = new Uint8Array(64 * 64 * 3).fill(0);

    render(<PixelDisplay width={64} height={64} frame={frame} pixelSize={8} />);

    expect(mockCanvasContext.createImageData).toHaveBeenCalledWith(64, 64);
  });

  it("draws frame data to canvas", () => {
    const frame = new Uint8Array(64 * 64 * 3).fill(128);

    render(<PixelDisplay width={64} height={64} frame={frame} pixelSize={8} />);

    expect(mockCanvasContext.drawImage).toHaveBeenCalled();
  });

  it("disables image smoothing for pixel-perfect scaling", () => {
    const frame = new Uint8Array(64 * 64 * 3).fill(0);

    render(<PixelDisplay width={64} height={64} frame={frame} pixelSize={8} />);

    expect(mockCanvasContext.imageSmoothingEnabled).toBe(false);
  });

  it("draws grid lines after rendering pixels", () => {
    const frame = new Uint8Array(64 * 64 * 3).fill(0);

    render(<PixelDisplay width={64} height={64} frame={frame} pixelSize={8} />);

    // Should draw grid lines
    expect(mockCanvasContext.beginPath).toHaveBeenCalled();
    expect(mockCanvasContext.moveTo).toHaveBeenCalled();
    expect(mockCanvasContext.lineTo).toHaveBeenCalled();
    expect(mockCanvasContext.stroke).toHaveBeenCalled();
  });

  it("applies border and box shadow styles", () => {
    const { container } = render(
      <PixelDisplay width={64} height={64} frame={null} />
    );

    const canvas = container.querySelector("canvas");
    // Browser normalizes #333 to rgb(51, 51, 51)
    expect(canvas?.style.border).toMatch(/2px solid (rgb\(51, 51, 51\)|#333)/);
    expect(canvas?.style.borderRadius).toBe("4px");
    expect(canvas?.style.boxShadow).toContain("rgba(0, 0, 0, 0.5)");
  });

  it("re-renders when frame changes", () => {
    const frame1 = new Uint8Array(64 * 64 * 3).fill(0);
    const frame2 = new Uint8Array(64 * 64 * 3).fill(255);

    const { rerender } = render(
      <PixelDisplay width={64} height={64} frame={frame1} pixelSize={8} />
    );

    vi.clearAllMocks();

    rerender(
      <PixelDisplay width={64} height={64} frame={frame2} pixelSize={8} />
    );

    expect(mockCanvasContext.drawImage).toHaveBeenCalled();
  });

  it("handles different pixel sizes", () => {
    const { container } = render(
      <PixelDisplay width={32} height={32} frame={null} pixelSize={4} />
    );

    const canvas = container.querySelector("canvas");
    expect(canvas?.width).toBe(32 * 4); // 128
    expect(canvas?.height).toBe(32 * 4); // 128
  });
});
