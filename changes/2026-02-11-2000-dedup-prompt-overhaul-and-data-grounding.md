# Insight Dedup, Prompt Overhaul, and Data Grounding

*Date: 2026-02-11 2000*

## Why

Analysis of 2,477 insights over 7 days revealed a 54% repeat rate. "Best day this
week!" appeared 260 times (average gap: 32 minutes). The top 10 repeated phrases
were nearly all drawn verbatim from the prompt's example list — the agent was using
examples as a menu instead of generating original observations.

Separately, the agent was making inaccurate time claims like "steady drop since 8pm"
and "90 minutes of decline" when data showed only ~25 minutes of falling readings.

## How

### Server-Side Dedup (PR #229)

Added a dedup layer that rejects exact duplicate insights within a 6-hour window.
Comparison is case-insensitive and strips color markup before matching, so
`[green]Steady![/]` and `[yellow]steady![/]` are treated as duplicates.

### Debounce Increase (PR #229)

Increased debounce from 60 seconds to 5 minutes, matching CGM cadence. This cuts
insight volume from ~350/day to ~70/day without losing meaningful updates.

### Prompt Overhaul (PR #229)

- Removed example phrases the agent was copying verbatim
- Banned generic praise ("Best day!", "Great job!")
- Required specificity: time of day, comparison to recent data, or recent event
- Added reasoning capture for ongoing prompt refinement

### Data Grounding Step (PR #234)

Added "STEP 2 — SUMMARIZE WHAT YOU SEE" to the prompt, forcing the agent to state
facts from the data before writing an insight:
- Explicitly requests `getRecentGlucose(hours=3)` for full trajectory
- Reminds agent that each reading is 5 minutes apart
- Requires counting readings before claiming durations
- Anchors previous-CGM lookup to stream record timestamp

## Key Design Decisions

- **Dedup at storage layer**: Rejected duplicates never reach the display, regardless
  of prompt compliance
- **Strip markup before comparison**: Prevents the agent from bypassing dedup by
  changing colors on identical text
- **Grounding before insight**: Making the agent summarize data first catches
  hallucinated time claims before they reach the display
- **5-minute debounce**: Matches CGM reading cadence — one insight per reading at most

## PRs

- #229: Dedup layer, debounce increase, prompt overhaul
- #234: Data grounding step to fix inaccurate time claims

## What's Next

- Monitor insight variety over 24 hours post-deploy
- Verify dedup rejects exact duplicates in CloudWatch logs
- Confirm daily insight count drops from ~350 to ~70
