# Fix Agent Insight Display Layout

*Date: 2026-01-31 1830*

## Why

Several issues with the insight display:
1. The AI analyst agent was storing markdown headers (e.g., "## 📊 Last 4 Hours Analysis")
   instead of actual insight text when calling storeInsight
2. The weather band background was still rendering even though weather fetching was disabled
3. Insight text was limited to ~15 characters (one line), not enough for meaningful insights

## How

### Agent Prompt
Updated the agent's system prompt to be explicit about how to use the storeInsight tool:
- Content must be plain text only (no markdown, no headers, no bullet points)
- Maximum 80 characters for the tiny LED display
- Include concrete examples of good and bad insight formats
- Call storeInsight AFTER analysis with just the short summary

### Weather Band
- Skip rendering the sunlight gradient band when no weather data is provided
- Weather band only renders when weather data is explicitly passed
- All weather code preserved for future displays

### Insight Text Layout
- Two lines of text at Y=12 and Y=18 (6px spacing for 5px font)
- ~15 characters per line = ~30 characters total
- Word-wrap that prefers word boundaries but falls back to fixed character limit
- Strips markdown formatting (headers, bold markers)
- Adds truncation marker ".." when text exceeds available space

## Key Design Decisions

- **Explicit examples in prompt**: Models learn better from examples than abstract instructions
- **Conditional weather rendering**: Band only appears with weather data, leaving space for insights
- **Two-line insight display**: Doubles the available text from 15 to 30 characters
- **Weather preserved, not deleted**: All weather code stays in place for future displays
- **Character limit emphasis**: Reiterated the 80-char limit from the OpenAPI schema in the prompt itself for redundancy
- **Call order clarified**: Explicitly stated to call storeInsight AFTER analysis, not during markdown response generation

## What's Next

- Monitor agent behavior after deployment to verify insights are properly formatted
- Consider adding insight content validation in the Lambda if prompt engineering isn't sufficient
- Re-enable weather for future displays with different layouts
