# Fix Agent Insight Prompt and Disable Weather

*Date: 2026-01-31 1830*

## Why

Two issues with the insight display:
1. The AI analyst agent was storing markdown headers (e.g., "## 📊 Last 4 Hours Analysis")
   instead of actual insight text when calling storeInsight
2. The weather widget was overlapping with the insight display (both at Y=12)

## How

### Agent Prompt
Updated the agent's system prompt to be explicit about how to use the storeInsight tool:
- Content must be plain text only (no markdown, no headers, no bullet points)
- Maximum 80 characters for the tiny LED display
- Include concrete examples of good and bad insight formats
- Call storeInsight AFTER analysis with just the short summary

### Weather Widget
Disabled weather fetching in the compositor:
- Commented out fetchWeatherData() call
- Exported the function for future use in other displays
- Preserved all weather-related code for easy re-enablement

## Key Design Decisions

- **Explicit examples**: Added good/bad examples to the prompt because models learn
  better from examples than abstract instructions
- **Weather preserved, not deleted**: All weather code stays in place for future displays
  that may have room for both weather and insights
- **Character limit emphasis**: Reiterated the 80-char limit from the OpenAPI schema
  in the prompt itself for redundancy
- **Call order clarified**: Explicitly stated to call storeInsight AFTER analysis,
  not during markdown response generation

## What's Next

- Monitor agent behavior after deployment to verify insights are properly formatted
- Re-enable weather for future displays with different layouts
- Consider adding insight content validation in the Lambda if prompt engineering isn't sufficient
