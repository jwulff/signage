# Insight Quality Refinements

*Date: 2026-02-01 2306*

## Why

The AI-generated insights were too robotic and visually harsh:
- Agent produced abbreviations like "Hi 4h avg230 now241" instead of natural language
- Used exact glucose numbers ("241") instead of ranges ("over 200")
- Gave commands ("need bolus") instead of gentle suggestions ("bolus?")
- Bold colors competed with other display elements

## How

### Forceful Natural Language Prompt

Rewrote the agent prompt to be much more explicit about human-readable output:
- Added CRITICAL section at top emphasizing natural language
- Added FORBIDDEN section with explicit bad examples labeled "robotic garbage"
- Moved GOOD vs BAD comparison to top for emphasis

### Range-Based Numbers

Updated prompt to avoid exact glucose values:
- "over 200" instead of "241"
- "high for a while" instead of "above 200 3hrs"

### Questions Not Commands

Changed tone from commanding to suggestive:
- "bolus?" instead of "need bolus"
- "eat?" instead of "eat now"

### Muted Colors

Reduced all insight colors by ~33% for subtle tints:
- Green: 255 → 170
- Red: 255,60,60 → 170,40,40
- Yellow: 255,255 → 170,170
- Rainbow colors similarly muted

### Balanced Line Splitting

For short text that fits in two lines, split near the middle instead of filling the first line:
- Before: "BEEN HIGH A FEW" + "HOURS" (15+5 chars, unbalanced)
- After: "BEEN HIGH A" + "FEW HOURS" (11+9 chars, balanced)

Long text (>30 chars) still fills the first line before wrapping.

## Key Design Decisions

- **Forceful prompting**: The agent needed explicit FORBIDDEN examples to stop generating abbreviations. Subtle guidance wasn't enough.
- **Ranges over precision**: Exact numbers feel clinical; ranges feel human ("over 200" vs "241")
- **Questions over commands**: A caring friend suggests, doesn't order. "bolus?" feels supportive, "need bolus" feels judgmental.
- **Muted tints**: Colors should complement the display, not compete with glucose readings and charts.
- **Balanced lines**: Evenly distributed text looks more intentional; a lone word on line 2 looks like an afterthought.

## What's Next

- Monitor agent output quality with new prompts
- May need further prompt tuning based on edge cases
- Consider time-based color intensity (brighter for urgent, dimmer for observations)
