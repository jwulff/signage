# Fix Agent Insight Prompt

*Date: 2026-01-31 1830*

## Why

The AI analyst agent was storing markdown headers (e.g., "## 📊 Last 4 Hours Analysis")
instead of actual insight text when calling storeInsight. This resulted in the LED display
showing unhelpful content instead of the meaningful glucose insights the agent generated.

## How

Updated the agent's system prompt to be explicit about how to use the storeInsight tool:
- Content must be plain text only (no markdown, no headers, no bullet points)
- Maximum 80 characters for the tiny LED display
- Include concrete examples of good and bad insight formats
- Call storeInsight AFTER analysis with just the short summary

## Key Design Decisions

- **Explicit examples**: Added good/bad examples to the prompt because models learn
  better from examples than abstract instructions
- **Character limit emphasis**: Reiterated the 80-char limit from the OpenAPI schema
  in the prompt itself for redundancy
- **Call order clarified**: Explicitly stated to call storeInsight AFTER analysis,
  not during markdown response generation

## What's Next

- Monitor agent behavior after deployment to verify insights are properly formatted
- Consider adding insight content validation in the Lambda if prompt engineering isn't sufficient
