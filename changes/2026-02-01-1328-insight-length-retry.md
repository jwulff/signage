# Insight Length Enforcement with Retry

*Date: 2026-02-01 1328*

## Why

The AI agent often generates insights longer than the 30-character LED display limit, causing text to be cut off. Despite prompt engineering, the agent doesn't consistently follow character limits.

## How

Added a retry loop in the hourly analysis handler:
1. After agent stores an insight, fetch it and check length
2. If > 30 chars, call agent again with explicit shortening instructions
3. Repeat up to 2 times (max 3 total attempts)
4. If still too long, force-truncate as last resort

## Key Design Decisions

- **Session continuity**: Reuse the same agent session ID for shortening requests so the agent has context of the original insight
- **Max 2 retries**: Avoid infinite loops while giving agent reasonable chance to comply
- **Force truncation fallback**: Guarantees 30-char limit even if agent fails to cooperate
- **Explicit character count**: Show agent exactly how many chars over the limit to help it understand the constraint

## What's Next

- Monitor if retry loop is frequently triggered (indicates prompt needs improvement)
- Consider caching successful abbreviation patterns
