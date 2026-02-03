# Enable Deeper Analysis with Insight History

*Date: 2026-02-02 2158*

## Why

The analysis was generating repetitive insights because:
1. The agent had no visibility into what it had said recently
2. It focused only on current glucose values, missing broader patterns
3. It didn't consider day-over-day trends or time-of-day patterns

## How

### Exposed Insight History API

The `getInsightHistory` function already existed in the handler but wasn't exposed in the OpenAPI schema. Added it so the agent can fetch recent insights:

```yaml
/getInsightHistory:
  post:
    summary: Get recent insights
    description: Retrieves insight history for the last N days
    parameters:
      - name: days
        default: 2
```

### Updated storeInsight Description

The OpenAPI description for `storeInsight` still referenced abbreviations ("avg", "TIR"). Updated to match the natural language guidelines:

> "Write like a human friend, NOT a robot. NO abbreviations. NO exact numbers (say 'over 200' not '241'). Use questions not commands."

### Restructured Analysis Prompt

Changed from a single prompt to a structured 3-step process:

1. **Gather Context** - Explicit instructions to call:
   - `getInsightHistory(days=2)` - see recent insights
   - `getGlucoseStats(period="day")` and `getGlucoseStats(period="week")` - compare trends
   - `getDailyAggregation()` - hourly patterns
   - `detectPatterns(type="all")` - recurring issues

2. **Think About What's Interesting** - Guide the agent to consider:
   - How today compares to the week
   - Time-of-day patterns (morning highs, overnight lows)
   - Multi-day trends (improving control)
   - What hasn't been said recently

3. **Write Like a Human** - Existing natural language guidelines plus:
   - Variety ideas (time patterns, trend observations, celebrations)
   - Examples: "Mornings are tough", "Better than yesterday!", "Best week in a while"

## Key Design Decisions

- **2-day history window**: Recent enough to avoid repetition, not so long it becomes noisy
- **Multiple data sources**: Uses aggregations and pattern detection rather than just raw readings
- **Structured prompting**: Separates data gathering from thinking from writing
- **Blue color for observations**: Trend insights use [blue] to differentiate from good/bad status

## What's Next

- Monitor for a day to see if insights become more varied
- May need to tune the history window based on insight frequency
- Consider adding explicit pattern callouts (e.g., "You tend to spike after lunch")
