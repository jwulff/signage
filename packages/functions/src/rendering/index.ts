/**
 * Shared rendering module
 * Used by both production compositor and local development server.
 */

export * from "./frame-composer.js";
export * from "./text.js";
export * from "./colors.js";
export * from "./blood-sugar-renderer.js";
export * from "./clock-renderer.js";
export * from "./chart-renderer.js";
export * from "./ascii-renderer.js";
export type { ClockWeatherData } from "./clock-renderer.js";
