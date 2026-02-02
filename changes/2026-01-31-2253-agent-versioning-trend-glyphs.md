# Agent Versioning and Trend Arrow Glyphs

*Date: 2026-01-31 2253*

## Why

Two issues needed fixing:

1. **Agent changes not deploying**: The Bedrock agent's instruction updates weren't taking effect because SST wasn't creating new agent versions. The alias was stuck pointing to an old version.

2. **Missing trend arrows**: The 3x5 pixel font lacked arrow glyphs (↑, ↓, ↗, ↘) needed to display glucose trend direction.

## How

### Agent Versioning
- Added `prepareAgent: true` to the SST agent configuration
- This triggers SST to create a new agent version whenever instructions change
- Documented the manual alias update workflow (SST limitation - aliases don't auto-update)

### Trend Glyphs
Added four arrow characters to the 3x5 bitmap font:
- `↑` - Rising (straight up)
- `↓` - Falling (straight down)
- `↗` - Rising slowly (diagonal up-right)
- `↘` - Falling slowly (diagonal down-right)

## Key Design Decisions

- **Manual alias routing**: SST doesn't support automatic alias-to-version routing, so we document the manual AWS console step after deploys that change agent instructions
- **Compact arrow design**: Arrows fit in 3x5 pixel grid while remaining recognizable at small scale

## What's Next

- Consider automating alias updates via custom SST component or post-deploy script
- May add `→` stable arrow if needed for trend display
