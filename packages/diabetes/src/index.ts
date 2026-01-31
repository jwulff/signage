/**
 * @diabetes/core
 *
 * Diabetes data model, storage, and analysis for Glooko data
 *
 * @example
 * ```typescript
 * import {
 *   parseGlookoExport,
 *   storeRecords,
 *   calculateGlucoseStats,
 *   detectAllPatterns,
 * } from "@diabetes/core";
 * ```
 */

// Models - Type definitions
export * from "./models/index.js";

// Storage - DynamoDB operations
export * from "./storage/index.js";

// Parsers - CSV and data format parsing
export * from "./parsers/index.js";

// Analysis - Computed metrics and patterns
export * from "./analysis/index.js";

// Aggregations - Pre-computed rollups
export * from "./aggregations/index.js";
