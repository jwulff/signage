# Insight Layout Polish

*Date: 2026-01-31 2020*

## Why

Two issues with the insight display:
1. Text lines were crowding the insulin display below
2. Agent insights were too long for the ~30 character space available

## How

### Layout Adjustment
- Moved insight text up by 1 pixel (Y=11 and Y=17 instead of Y=12 and Y=18)
- Provides better visual separation from the insulin/glucose data below

### Agent Prompt Update
- Updated prompt to emphasize EXTREME space constraints (~30 chars total)
- Added telegram-style abbreviation guide:
  - "and" → "&"
  - "hours" → "h" (e.g., "4h")
  - "days" → "d" (e.g., "5d")
  - "average" → "avg"
  - "overnight" → "ovrnt"
  - "breakfast" → "brkfst"
  - Drop vowels when clear: "steady" → "stdy"
- Updated examples to match new format:
  - "Stdy 108 100%TIR 4h"
  - "AM highs 3/5d chk brkfst"
  - "Grt ovrnt avg112 no lows"

## Key Design Decisions

- **Telegram style**: Maximizes information density in minimal space
- **Abbreviation guide in prompt**: Models follow examples better than rules
- **1px adjustment**: Small change with big visual impact on tight layout

## What's Next

- Monitor agent output to verify telegram-style abbreviations are used
- May need to add abbreviation post-processing in Lambda if agent doesn't comply
