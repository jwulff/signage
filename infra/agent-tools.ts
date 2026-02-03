/**
 * Agent Action Groups Infrastructure
 *
 * Lambda functions that provide tools for the Diabetes AI Analyst agent.
 */

import { table } from "./storage";

// =============================================================================
// Action Group Lambda Functions
// =============================================================================

// GlucoseDataTools - Query glucose readings and statistics
export const glucoseToolsFunction = new sst.aws.Function("GlucoseDataTools", {
  handler: "packages/functions/src/diabetes/tools/glucose.handler",
  link: [table],
  timeout: "30 seconds",
  memory: "256 MB",
  description: "Provides glucose data access for the diabetes analyst agent",
});

// TreatmentDataTools - Query insulin and carb data
export const treatmentToolsFunction = new sst.aws.Function("TreatmentDataTools", {
  handler: "packages/functions/src/diabetes/tools/treatment.handler",
  link: [table],
  timeout: "30 seconds",
  memory: "256 MB",
  description: "Provides treatment data access for the diabetes analyst agent",
});

// AnalysisTools - Aggregations and pattern detection
export const analysisToolsFunction = new sst.aws.Function("AnalysisTools", {
  handler: "packages/functions/src/diabetes/tools/analysis.handler",
  link: [table],
  timeout: "60 seconds",
  memory: "512 MB",
  description: "Provides analysis capabilities for the diabetes analyst agent",
});

// InsightTools - Store and retrieve AI insights
export const insightToolsFunction = new sst.aws.Function("InsightTools", {
  handler: "packages/functions/src/diabetes/tools/insight.handler",
  link: [table],
  timeout: "30 seconds",
  memory: "256 MB",
  description: "Provides insight storage for the diabetes analyst agent",
});

// =============================================================================
// OpenAPI Schemas for Action Groups
// =============================================================================

// OpenAPI schema for GlucoseDataTools
// NOTE: Limited to 2 APIs to stay under Bedrock's 11 API limit per agent
export const glucoseToolsSchema = `
openapi: 3.0.0
info:
  title: GlucoseDataTools
  version: 1.0.0
paths:
  /getRecentGlucose:
    post:
      summary: Get recent glucose readings
      description: Retrieves glucose readings (CGM and fingerstick) from the last N hours
      operationId: getRecentGlucose
      parameters:
        - name: hours
          in: query
          description: Number of hours to look back (1-24)
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 24
            default: 4
      responses:
        '200':
          description: List of glucose readings with count and latest value
  /getGlucoseStats:
    post:
      summary: Get glucose statistics
      description: Calculates TIR, average, variability, and other metrics for a period
      operationId: getGlucoseStats
      parameters:
        - name: period
          in: query
          description: Time period for statistics
          required: false
          schema:
            type: string
            enum: [day, week, month]
            default: day
      responses:
        '200':
          description: Glucose statistics including TIR, mean, stdDev, CV
`;

// OpenAPI schema for TreatmentDataTools
export const treatmentToolsSchema = `
openapi: 3.0.0
info:
  title: TreatmentDataTools
  version: 1.0.0
paths:
  /getRecentTreatments:
    post:
      summary: Get recent treatments
      description: Retrieves insulin boluses, carbs, and manual insulin from the last N hours
      operationId: getRecentTreatments
      parameters:
        - name: hours
          in: query
          description: Number of hours to look back (1-24)
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 24
            default: 4
      responses:
        '200':
          description: List of treatments with totals
  /getDailyInsulinTotals:
    post:
      summary: Get daily insulin totals
      description: Retrieves daily total insulin units for the last N days
      operationId: getDailyInsulinTotals
      parameters:
        - name: days
          in: query
          description: Number of days to look back (1-30)
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 30
            default: 7
      responses:
        '200':
          description: Daily insulin totals with statistics
  /getMealBoluses:
    post:
      summary: Get meal boluses
      description: Retrieves boluses that include carbs for meal analysis
      operationId: getMealBoluses
      parameters:
        - name: startDate
          in: query
          description: Start date (YYYY-MM-DD)
          required: true
          schema:
            type: string
            format: date
        - name: endDate
          in: query
          description: End date (YYYY-MM-DD)
          required: true
          schema:
            type: string
            format: date
      responses:
        '200':
          description: Meal boluses with carb ratios
`;

// OpenAPI schema for AnalysisTools
export const analysisToolsSchema = `
openapi: 3.0.0
info:
  title: AnalysisTools
  version: 1.0.0
paths:
  /getDailyAggregation:
    post:
      summary: Get daily aggregation
      description: Retrieves pre-computed daily statistics and hourly breakdown
      operationId: getDailyAggregation
      parameters:
        - name: date
          in: query
          description: Date to get aggregation for (YYYY-MM-DD)
          required: false
          schema:
            type: string
            format: date
      responses:
        '200':
          description: Daily statistics and hourly breakdown
  /getWeeklyAggregation:
    post:
      summary: Get weekly aggregation
      description: Retrieves weekly statistics and daily breakdown
      operationId: getWeeklyAggregation
      parameters:
        - name: weekOffset
          in: query
          description: Number of weeks back (0 = current week)
          required: false
          schema:
            type: integer
            default: 0
      responses:
        '200':
          description: Weekly statistics and daily breakdown
  /detectPatterns:
    post:
      summary: Detect patterns
      description: Analyzes glucose data for patterns like overnight lows, meal spikes
      operationId: detectPatterns
      parameters:
        - name: type
          in: query
          description: Pattern type to detect
          required: false
          schema:
            type: string
            enum: [meal, overnight, correction, all]
            default: all
      responses:
        '200':
          description: Detected patterns with frequency and severity
`;

// OpenAPI schema for InsightTools
export const insightToolsSchema = `
openapi: 3.0.0
info:
  title: InsightTools
  version: 1.0.0
paths:
  /storeInsight:
    post:
      summary: Store a new insight
      description: Saves an AI-generated insight for display on the LED screen
      operationId: storeInsight
      parameters:
        - name: type
          in: query
          description: Type of insight
          required: true
          schema:
            type: string
            enum: [hourly, daily, weekly, alert]
        - name: content
          in: query
          description: "CRITICAL: Insight text for 64x64 LED display. MUST be 30 characters or less. Write like a human friend, NOT a robot. NO abbreviations (never 'avg', 'TIR', 'hi'). NO exact numbers (say 'over 200' not '241'). Use questions not commands ('bolus?' not 'need bolus'). Examples: 'In range all day!' or 'Been high a while, bolus?'"
          required: true
          schema:
            type: string
            maxLength: 30
        - name: metrics
          in: query
          description: JSON object with supporting metrics (tir, avgGlucose, etc.)
          required: false
          schema:
            type: string
        - name: reasoning
          in: query
          description: "Explain your thinking process. What data did you look at? What patterns did you notice? Why did you choose THIS insight over others? What recent insights did you avoid repeating? This helps refine future prompts."
          required: false
          schema:
            type: string
            maxLength: 500
      responses:
        '200':
          description: Confirmation with insight ID
  /getCurrentInsight:
    post:
      summary: Get current insight
      description: Retrieves the most recent insight being displayed
      operationId: getCurrentInsight
      responses:
        '200':
          description: Current insight with staleness status
  /getInsightHistory:
    post:
      summary: Get recent insights
      description: Retrieves insight history for the last N days. Use this to see what insights have been shown recently to avoid repetition and provide variety.
      operationId: getInsightHistory
      parameters:
        - name: days
          in: query
          description: Number of days to look back (1-30)
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 30
            default: 2
      responses:
        '200':
          description: List of recent insights with timestamps
`;
