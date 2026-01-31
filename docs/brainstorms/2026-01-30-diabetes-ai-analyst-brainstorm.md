# Brainstorm: Diabetes AI Analyst Agent

*Date: 2026-01-30*

## What We're Building

An AI-powered diabetes analyst that reviews glucose and treatment data, providing both real-time guidance and periodic deep analysis. The agent acts as a friendly endocrinologist, delivering data-specific insights with an encouraging tone.

### Core Capabilities

1. **Real-time insights** - Quick analysis when new data arrives (hourly via Glooko scraper)
2. **Periodic deep analysis** - Daily comprehensive review with patterns and recommendations
3. **Display integration** - One-line insights shown on Pixoo (replacing weather band)
4. **Long-term intelligence** - Learns from years of historical data

### Example Outputs

- "Nice job! TIR 78% today. Lunch bolus could've been 6m earlier."
- "Breakfast spike pattern detected. Consider pre-bolusing 10min before eating."
- "Overnight lows trending. Basal might need -0.05u/hr adjustment 2-4am."

## Why This Approach

### Event-Driven Analysis Pipeline

```
┌────────────────────────────────────────────────────────────────────┐
│                         DATA INGESTION                              │
├────────────────────────────────────────────────────────────────────┤
│  Glooko Scraper (hourly)                                           │
│      ↓                                                              │
│  DynamoDB (indefinite retention, full detail)                      │
│      ↓                                                              │
│  EventBridge (triggers on new records)                             │
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────┐
│                         ANALYSIS LAYER                              │
├────────────────────────────────────────────────────────────────────┤
│  Lambda Trigger                                                     │
│      ↓                                                              │
│  AWS Bedrock AgentCore (hybrid approach)                           │
│  ├─ Agent orchestration via AgentCore                              │
│  ├─ Custom Lambda tools for data access                            │
│  └─ Claude model for analysis                                      │
│      ↓                                                              │
│  Insight Generation                                                 │
│  ├─ Short-form: one-liner for display (cached)                    │
│  └─ Long-form: detailed analysis (stored for reference)           │
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────┐
│                         DISPLAY LAYER                               │
├────────────────────────────────────────────────────────────────────┤
│  Compositor (every minute)                                          │
│      ↓                                                              │
│  Pulls latest insight from cache                                    │
│      ↓                                                              │
│  Renders to Pixoo (all-diabetes layout, no weather)                │
└────────────────────────────────────────────────────────────────────┘
```

**Why event-driven over always-on:**
- Cost efficient (~24 calls/day vs 1440)
- Natural cadence matches data availability (hourly scraper)
- Cached insights = fast display updates
- Separate deep analysis (daily) from quick insights (hourly)

**Why hybrid AgentCore:**
- AgentCore handles orchestration, memory, tool routing
- Custom Lambda tools give precise control over data queries
- Can evolve tools without changing agent definition
- Keeps data access patterns in our code, not agent prompts

## Key Decisions

### 1. Package Architecture

**Decision:** Separate `@diabetes/core` npm package in its own repo

```
github.com/jwulff/diabetes-core/
├── src/
│   ├── models/           # Record types (CGM, bolus, basal, etc.)
│   ├── storage/          # DynamoDB access patterns
│   ├── analysis/         # Computed metrics (TIR, variability, etc.)
│   ├── aggregations/     # Rollups, summaries, windows
│   ├── parsers/          # CSV parsing (Glooko, future: Dexcom Clarity)
│   └── index.ts          # Public API
├── package.json          # @diabetes/core
└── tsconfig.json
```

**Migration strategy:** Move + deprecate
1. Create new repo `diabetes-core`
2. Move `packages/functions/src/glooko/*` to new repo
3. Leave re-export stubs in signage (temporary compatibility)
4. Update signage imports to use `@diabetes/core`
5. Remove stubs once migration complete

**Development workflow:**
- Local: `pnpm link` for rapid iteration
- CI/Prod: Publish to npm, signage uses versioned dependency

**Rationale:**
- Clean API boundary for agent tools
- Reusable across projects (signage, future mobile app, web dashboard)
- Testable in isolation
- Can publish to npm for other projects
- Separate release cycle from signage

### 2. Data Model

**Decision:** Indefinite retention with date-partitioned schema

**Volume estimate:** ~125K records/year, ~1.25M over 10 years

**Schema design:**
```
┌─────────────────────────────────────────────────────────────────────┐
│                        PRIMARY TABLE                                 │
├─────────────────────────────────────────────────────────────────────┤
│ PK                          │ SK                                     │
├─────────────────────────────┼───────────────────────────────────────┤
│ Raw Records (by type+day) - prevents hot partitions                 │
├─────────────────────────────┼───────────────────────────────────────┤
│ USR#john#CGM#2026-01-30     │ 1738281600000                         │
│ USR#john#BOLUS#2026-01-30   │ 1738290000000#abc123                  │
├─────────────────────────────┼───────────────────────────────────────┤
│ Daily/Weekly Aggregations - pre-computed for fast analysis          │
├─────────────────────────────┼───────────────────────────────────────┤
│ USR#john#AGG#DAILY          │ 2026-01-30                            │
│ USR#john#AGG#WEEKLY         │ 2026-W05                              │
├─────────────────────────────┼───────────────────────────────────────┤
│ Agent Insights - current + history                                   │
├─────────────────────────────┼───────────────────────────────────────┤
│ USR#john#INSIGHT#CURRENT    │ _                                     │
│ USR#john#INSIGHT#HISTORY    │ 1738300000000                         │
└─────────────────────────────┴───────────────────────────────────────┘

GSI1: USR#john#ALL / {timestamp} → Cross-type time queries
GSI2: USR#john#{type} / {date}#{timestamp} → Type-based date range
```

**Key decisions:**
- Date in PK prevents hot partitions (max ~300 items/partition/day)
- Pre-computed aggregations reduce agent query costs
- Singleton insight item for fast display reads
- No TTL on core records (indefinite retention)
- Future: S3 export for analytics/ML training

### 3. Display Layout

**Decision:** All-diabetes layout with static AI insight (replaces weather)

```
┌────────────────────────────────────────────────────────────────┐
│ Row 1-5:   Time + Date (3x5)        "10:42  Thu 30"            │
├────────────────────────────────────────────────────────────────┤
│ Row 7-11:  AI Insight (3x5)         "Nice! TIR 78%"            │
│            (static, updates hourly, replaces weather)          │
├────────────────────────────────────────────────────────────────┤
│ Row 13-20: Insulin totals           "18 12 15 16 12  2h"       │
│            (5-day + bolus/basal bars + latency)                │
├────────────────────────────────────────────────────────────────┤
│ Row 22-26: Glucose reading          "→ 142 +8 3m"              │
│            (arrow + value + delta + age)                        │
├────────────────────────────────────────────────────────────────┤
│ Row 28-62: Sparkline chart (35px)   ═══════════════════════    │
│            (21h compressed | 3h detailed)                       │
└────────────────────────────────────────────────────────────────┘
```

**Insight format:** Static one-liner, max ~20 chars visible, updates hourly
**Chart gain:** Recovered space from combined time/date = 35px chart (was 29px)

### 4. Agent Tone

**Decision:** Data-specific + friendly coach

Template: `"{encouragement} {metric}. {actionable suggestion}."`

Examples:
- "Great morning! TIR 92%. Keep that pre-bolus timing."
- "Heads up: 3 lows this week after 2pm. Snack or reduce lunch bolus?"
- "Weekly TIR: 75% → 82%. That basal adjustment is working!"

### 5. Analysis Cadence

| Type | Trigger | Output | Storage |
|------|---------|--------|---------|
| Quick insight | Hourly (on scraper) | One-liner | DynamoDB cache |
| Pattern alert | On detection | Specific warning | Push + cache |
| Daily summary | 6am Pacific | 3-5 bullet points | DynamoDB + display |
| Weekly review | Sunday 6am | Detailed analysis | DynamoDB archive |

### 6. AgentCore + Tools Design

**Decision:** Hybrid AgentCore with comprehensive tool access + knowledge base

```
┌─────────────────────────────────────────────────────────────────────┐
│                     BEDROCK AGENTCORE                                │
├─────────────────────────────────────────────────────────────────────┤
│  Agent: "DiabetesAnalyst"                                           │
│  Model: Claude (via Bedrock)                                        │
│  Memory: Persistent (learns user patterns over time)                │
│                                                                      │
│  System Prompt Context (always provided):                           │
│  • User's pump settings (I:C, ISF, basal rates, targets)           │
│  • Historical baselines (typical TIR, avg daily insulin)           │
│  • Tone: data-specific + friendly coach                            │
│                                                                      │
│  ACTION GROUPS (Lambda-backed):                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  1. GlucoseDataTools                                          │ │
│  │     • getRecentGlucose(hours: 1-24)                          │ │
│  │     • getGlucoseStats(period: day|week|month)                │ │
│  │     • getTimeInRange(startDate, endDate)                     │ │
│  │                                                                │ │
│  │  2. TreatmentDataTools                                        │ │
│  │     • getRecentTreatments(hours: 1-24)                       │ │
│  │     • getDailyInsulinTotals(days: 1-30)                      │ │
│  │     • getMealBoluses(startDate, endDate)                     │ │
│  │                                                                │ │
│  │  3. AnalysisTools                                             │ │
│  │     • getDailyAggregation(date)                              │ │
│  │     • getWeeklyAggregation(weekNumber)                       │ │
│  │     • detectPatterns(type: meal|overnight|correction)        │ │
│  │                                                                │ │
│  │  4. InsightTools                                              │ │
│  │     • storeInsight(type, content, metrics)                   │ │
│  │     • getInsightHistory(days: 1-30)                          │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  KNOWLEDGE BASE:                                                     │
│  • ADA diabetes management guidelines                               │
│  • Insulin adjustment protocols                                      │
│  • Pump settings best practices                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Analysis depth:** Comprehensive (4+ tool calls per insight)
- Hourly: glucose + treatments + daily stats + patterns
- Daily: all of above + weekly trends + knowledge base lookup

**Prompt template (hourly):**
```
You are a friendly diabetes analyst. Review the data and provide ONE insight.

User context: {pumpSettings}, {baselines}

Format: "{encouragement} {metric}. {actionable suggestion}."
Max 80 characters (fits on Pixoo display).

Examples:
- "Nice job! TIR 78%. Lunch bolus could've been 6m earlier."
- "Heads up: overnight low pattern. Consider -0.05u/hr basal 2-4am."
```

## Open Questions

1. **User preferences** - How should the user tune the agent (more/less aggressive suggestions, focus areas)?

2. **Alert thresholds** - When should insights interrupt vs. wait for scheduled update?

3. **Multi-user support** - Is this single-user only, or should the architecture support multiple users from the start?

4. **Offline fallback** - What shows on display if agent/Bedrock is unavailable?

## Next Steps

1. **Create `@diabetes/core` package** - Extract and refactor Glooko data model
2. **Design DynamoDB schema v2** - Optimize for agent queries
3. **Prototype AgentCore setup** - Basic agent with data tool
4. **Update display layout** - Replace weather with insight region
5. **Iterate on prompts** - Tune agent personality and output format

---

*Ready for `/workflows:plan` when design is approved.*
