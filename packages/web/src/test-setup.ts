import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock canvas 2d context
const createMockContext = () => ({
  fillStyle: "",
  fillRect: vi.fn(),
  createImageData: vi.fn((w: number, h: number) => ({
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
  })),
  putImageData: vi.fn(),
  drawImage: vi.fn(),
  imageSmoothingEnabled: true,
  strokeStyle: "",
  lineWidth: 1,
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
});

// Store mock context for assertions
export const mockCanvasContext = createMockContext();

HTMLCanvasElement.prototype.getContext = vi.fn(function (
  this: HTMLCanvasElement,
  contextId: string
) {
  if (contextId === "2d") {
    return mockCanvasContext;
  }
  return null;
}) as typeof HTMLCanvasElement.prototype.getContext;
