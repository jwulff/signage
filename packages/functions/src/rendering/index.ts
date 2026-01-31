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
export * from "./readiness-renderer.js";
export * from "./treatment-renderer.js";
export * from "./insight-renderer.js";
export type { ClockWeatherData, ClockRegionBounds } from "./clock-renderer.js";
export type { ReadinessDisplayData } from "./readiness-renderer.js";
export type { ChartBounds } from "./treatment-renderer.js";
export type { InsightDisplayData } from "./insight-renderer.js";
