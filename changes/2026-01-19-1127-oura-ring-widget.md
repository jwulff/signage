# Oura Ring Readiness Widget

*Date: 2026-01-19 1127*

## Why

Wanted to display Oura Ring readiness scores for family members on the signage display. This provides a quick morning glance at sleep/recovery status without needing to open the Oura app.

## How

Built complete OAuth integration for Oura API:
1. Created OAuth start/callback endpoints for linking Oura accounts
2. Built link page UI at /link for initiating OAuth flow
3. Implemented daily cron job to fetch readiness scores
4. Created readiness renderer showing scores with color-coded values

Layout integration:
1. Initially tried split layout (Oura top-left, clock top-right)
2. Iterated to horizontal layout below weather band ("J 82  S 75")
3. Kept original full-width clock layout when no users linked

Also included in this PR:
- Git hooks for workflow enforcement (post-checkout, enhanced pre-push)
- ESLint/Prettier configuration for code consistency
- Updated CLAUDE.md with anti-patterns documentation

## Key Design Decisions

- OAuth flow stores tokens in DynamoDB with encryption
- Readiness scores color-coded: green (good), yellow (fair), red (poor)
- Horizontal layout chosen over split to preserve clock readability
- Cron runs at 6 AM PT to have scores ready for morning viewing
- First initial + score format ("J 82") keeps display compact

## What's Next

- Add sleep score alongside readiness (shows recovery quality)
- Consider activity score for completeness
- Could add trend indicators (up/down from yesterday)
