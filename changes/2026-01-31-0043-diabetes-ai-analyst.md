# Diabetes AI Analyst - Full Implementation

*Date: 2026-01-31 0043*

## Why

The signage display showed real-time glucose data but lacked intelligent analysis. Users had to interpret patterns themselves. An AI-powered analyst could provide actionable insights like "overnight lows 3 of 5 nights" or "post-breakfast spikes, try pre-bolusing."

## How

### New @diabetes/core Package

Created a shared package for diabetes data management:

**Models** - Type-safe data models for all diabetes records:
- CGM readings, blood glucose, bolus, basal, carbs
- Insight types for AI-generated analysis
- Properly exported with barrel files

**Storage** - Date-partitioned DynamoDB schema (v2):
- Efficient time-range queries with pk=USR#{userId}#{TYPE}#{date}
- Hash-based deduplication keys
- Record CRUD with conditional writes
- Insight storage with TTL support

**Analysis** - Glucose statistics and pattern detection:
- Time in Range (TIR), Time Below/Above Range (TBR/TAR)
- Coefficient of variation, estimated A1C, GMI
- Pattern detection: overnight lows, post-meal spikes, morning highs

### Bedrock Agent Infrastructure

**Agent Configuration** (infra/agent.ts):
- Claude Sonnet model via inference profile
- 10 action groups for data access and insight storage
- OpenAPI schemas for each tool
- Hourly analysis cron trigger

**Action Groups**:
- getGlucoseReadings, getInsulinData, getCarbData
- getGlucoseStats, getPatterns
- storeInsight (with 30-char limit for LED display)

### Deployment Challenges

Required ~15 fix commits to get working:
- Inference profile IAM permissions (#180-183)
- OpenAPI response format for Bedrock (#184)
- GSI query case sensitivity (#185)
- Tool parameter validation (#186-187)
- SST Cron inline function workaround (#177)
- Agent API limit (reduced from 12 to 10) (#176)
- Knowledge Base disabled (OpenSearch not supported) (#174)

## Key Design Decisions

- **Date-partitioned keys**: Efficient queries without full table scans
- **Inference profiles**: Required for Claude Sonnet 4.5 in Bedrock
- **30-char insight limit**: Matches LED display constraints (2 lines × 15 chars)
- **Hourly analysis**: Balances freshness with API costs
- **Fire-and-forget dual-write**: Display priority over agent data writes

## What's Next

- Real-time stream triggers (instead of hourly cron)
- Insight quality validation and retry logic
- Color-coded insights based on urgency
- Multi-day trend analysis
