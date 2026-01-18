# News Digest Widget with Bedrock Web Grounding

*Date: 2026-01-14 2302*

## Why
Users want to display current news headlines on their signage displays without manual updates. Leveraging AWS Bedrock with web grounding enables AI-powered news fetching with real-time information.

## How
Created a new Lambda-backed endpoint that:
1. Checks for active WebSocket connections before making expensive Bedrock calls
2. Uses Claude Haiku with web grounding to fetch current news headlines
3. Renders headlines on 64x64 pixel displays with proper word wrapping
4. Cycles through 5 headlines with 2-second delays between frames

## Key Design Decisions
- **Smart cost optimization**: Skip Bedrock calls entirely when no displays are connected
- **Word wrapping**: Created reusable text utilities that handle 10-char line limits gracefully
- **Cycling display**: Headlines rotate automatically, showing position indicator (1/5, 2/5, etc.)
- **Topic flexibility**: Query parameter allows fetching news on any topic (`?topic=AI`)

## What's Next
- Add EventBridge scheduled trigger for automatic updates
- Implement headline caching in DynamoDB to reduce API calls
- Add source citations to display
- Support multiple topic rotation
