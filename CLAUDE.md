# Signage Development Guide

Personal digital signage system for Pixoo64 and other displays.

---

## Deployment Region

**IMPORTANT**: All AWS resources deploy to **us-east-1** only.

---

## Project Overview

Signage is a serverless AWS-backed system for personal digital signage:
- **Terminals**: Pixoo64 (64x64 LED matrix), web emulator, future displays
- **Architecture**: SST v3, WebSocket API, DynamoDB, CloudFront
- **Data Flow**: Widget data → SNS → Lambda → WebSocket → Terminals
- **Local Relay**: Node.js CLI bridges AWS to Pixoo's local HTTP API

---

## Complete Workflow

Every change follows this 10-step workflow:

```
1. Create branch from main/        git branch feature/my-feature (from main/)
2. Create worktree                 git -C main worktree add ../feature-my-feature feature/my-feature
3. Enter worktree                  cd feature-my-feature
4. Write failing tests first       TDD mandatory
5. Implement minimum code          Make tests pass
6. Commit frequently               After each logical unit of work
7. Push and create PR              gh pr create --fill
8. Wait for CI                     Tests must pass
9. Wait for Copilot review         Never merge before review
10. Merge via GitHub API           gh api repos/{owner}/{repo}/pulls/{number}/merge -X PUT
```

---

## Git Worktree Management

### Session Startup Protocol

When starting a session, determine which mode you're in:

1. **Hub Mode** (`~/Development/signage/`)
   - Read `main/CLAUDE.md` for routing
   - List worktrees: `git -C main worktree list`
   - Route to appropriate worktree based on task

2. **Main Mode** (`main/`)
   - For repository operations only (create branches, update base)
   - NEVER make feature changes here

3. **Worktree Mode** (`feature-*/`, `fix-*/`, `chore-*/`)
   - Active development happens here
   - Isolated from other work
   - Commits go to feature branch

### Creating a Worktree

```bash
# From main/ directory
cd ~/Development/signage/main

# Create branch first (NOT checkout -b)
git branch feature/my-feature

# Create worktree
git worktree add ../feature-my-feature feature/my-feature

# Enter worktree
cd ../feature-my-feature
```

### Listing Worktrees

```bash
git -C ~/Development/signage/main worktree list
```

---

## Development Groundrules (RFC 2119)

### MUST (Mandatory)

- **MUST** use worktrees for ALL changes (never commit in main/)
- **MUST** write failing tests before implementation (TDD)
- **MUST** create a changes file for each PR
- **MUST** wait for Copilot review before merging
- **MUST** use GitHub API for merges (not `gh pr merge`)
- **MUST** include test attestation in commit messages
- **MUST** run `pnpm lint` before committing
- **MUST** commit after EVERY user interaction (no batching)

### MUST NOT (Forbidden)

- **MUST NOT** commit directly to main branch
- **MUST NOT** use `git checkout -b` in main/
- **MUST NOT** force push to main
- **MUST NOT** bypass branch protection
- **MUST NOT** merge without passing CI
- **MUST NOT** use `--admin` flag on `gh pr merge`
- **MUST NOT** merge without Copilot review completion
- **MUST NOT** commit `.env`, `.env.local`, or credential files

### SHOULD (Recommended)

- SHOULD commit after each logical unit of work
- SHOULD push frequently for backup
- SHOULD keep PRs focused and small
- SHOULD use conventional commit prefixes (feat:, fix:, chore:, docs:)

---

## Anti-Patterns to Avoid

These patterns cause problems. Avoid them:

1. **Working in main/** - Never make feature changes in the main directory. Use worktrees.

2. **Skipping tests** - Never implement without tests first. TDD is mandatory.

3. **Large PRs** - Keep changes focused. Split large features into smaller PRs.

4. **Skipping changes files** - Every PR needs a changes file explaining why.

5. **Using `gh pr merge`** - This command tries to checkout main, breaking worktrees. Use the API instead.

6. **Merging without review** - Always wait for Copilot review, even for small changes.

7. **Committing secrets** - Never commit `.env`, credentials, or API keys.

8. **Force pushing to main** - This breaks other worktrees and is forbidden.

9. **Ignoring lint errors** - Fix all lint errors before committing.

10. **Skipping test attestation** - Include `[tests-passed: X tests in Ys]` in commits.

---

## Hook Enforcement

Git hooks automatically enforce workflow rules:

### post-checkout Hook
**Purpose**: Prevents accidental branch switching in main/

**Behavior**:
- Detects checkout of non-main branches in the main worktree
- Automatically reverts to main branch
- Shows guidance on creating worktrees instead

**Why**: The main/ directory must stay on main branch. Feature work happens in worktrees.

### pre-push Hook
**Purpose**: Ensures tests pass and attestation exists before push

**Behavior**:
1. Checks commit messages for `[tests-passed: X tests in Ys]`
2. Prompts interactively if attestation missing (default: abort)
3. Runs full test suite before allowing push
4. Fails push if tests fail

**Why**: Catches issues locally before expensive CI runs. Documents test results in git history.

### Hook Installation
Hooks are configured via `core.hooksPath=.githooks` in git config.
New clones should run:
```bash
git config core.hooksPath .githooks
```

---

## Package Development

### Core (`packages/core`)
Shared types and Pixoo protocol implementation.

```bash
cd packages/core
pnpm test           # Run tests
pnpm build          # Build TypeScript
```

Key files:
- `src/types.ts` - Type definitions (Terminal, Widget, Frame)
- `src/pixoo.ts` - Pixoo protocol (bitmap encoding, commands)

### Functions (`packages/functions`)
Lambda handlers for WebSocket API.

```bash
cd packages/functions
pnpm test           # Run tests
pnpm build          # Build TypeScript
```

Key files:
- `src/connect.ts` - WebSocket $connect handler
- `src/disconnect.ts` - WebSocket $disconnect handler
- `src/message.ts` - WebSocket $default handler

### Relay (`packages/relay`)
Local CLI that bridges AWS to Pixoo.

**Current Pixoo IP**: `<PIXOO_IP>` (find via Divoom app or network scan)

| Environment | WebSocket URL |
|-------------|---------------|
| Production | `wss://ws.signage.example.com` |
| Development | `wss://ws.dev.signage.example.com` |

```bash
cd packages/relay

# Production
npx tsx src/cli.ts --ws wss://ws.signage.example.com

# Development
npx tsx src/cli.ts --ws wss://ws.dev.signage.example.com
```

### Web (`packages/web`)
React web emulator with canvas-based display.

```bash
cd packages/web
pnpm dev            # Start dev server
pnpm build          # Production build
```

### Local Dev (`packages/local-dev`)
Local WebSocket server for testing without AWS deployment.

```bash
cd packages/local-dev
pnpm start          # Start local server
pnpm dev            # Start with file watching
```

---

## Local Development (No AWS)

For rapid iteration without deploying to AWS, use the local development server.

### Quick Start

```bash
# From repo root
pnpm dev:local
```

This runs both the local WebSocket server and web emulator. Open http://localhost:5173.

### First-Time Setup

On first run, the server prompts for widget credentials:

```
┌─────────────────────────────────────────┐
│     Local Development Setup             │
└─────────────────────────────────────────┘

─── Blood Sugar Widget (Dexcom) ───
Set up Dexcom credentials? (y/n):
```

Enter your Dexcom Share credentials (or skip to use mock data). Credentials are saved to `.env.local` (gitignored).

### Configuration File

Credentials are stored in `.env.local` at the repo root:

```bash
# .env.local (auto-generated, gitignored)
DEXCOM_USERNAME=your_username
DEXCOM_PASSWORD=your_password
```

To reconfigure, delete `.env.local` and restart the server.

### Running Separately

```bash
# Terminal 1: Start WebSocket server
pnpm dev:server

# Terminal 2: Start web emulator
pnpm dev:web
```

### Architecture

The local server uses the **same rendering code** as production (`@signage/functions/rendering`). Only the transport layer differs:

| Component | Production | Local |
|-----------|------------|-------|
| WebSocket | API Gateway | ws://localhost:8080 |
| Clients | DynamoDB | In-memory Set |
| Scheduling | EventBridge | setInterval |
| Secrets | SST Secrets | .env.local |

### ASCII Frame Debugger

Render frames as ASCII art in the terminal for quick debugging without a browser:

```bash
pnpm --filter @signage/local-dev exec tsx src/debug-frame.ts
```

Output shows the 64x64 display with brightness indicators:
```
  ┌────────────────────────────────────────────────────────────────┐
 4│                   █     █         █████ █████                  │  <- Clock
...
34│    ███    ███    █   █████        █   █████       █████        │  <- Blood sugar
...
47│ ········█████······█▓······································▓·· │  <- Chart
  └────────────────────────────────────────────────────────────────┘

Legend: █=bright ▓=medium ▒=dim ░=faint ·=very dim (space)=off
```

Edit `packages/local-dev/src/debug-frame.ts` to test different glucose values, trends, and history data.

---

## SST Development

### Local Development

```bash
# From root or main/
pnpm dev            # Start SST dev mode

# This will:
# - Deploy dev stage to AWS
# - Watch for changes
# - Hot reload Lambda functions
```

### Deployment

```bash
pnpm deploy         # Deploy to dev stage
pnpm deploy:prod    # Deploy to production
```

### Stage Management

- `dev` - Development (auto-remove on `sst remove`)
- `prod` - Production (protected, retained on remove)

---

## GitHub PR Workflow

### Branch Naming

```
feature/<description>    # New features
fix/<description>        # Bug fixes
chore/<description>      # Maintenance tasks
docs/<description>       # Documentation only
```

### Creating a PR

```bash
# Push branch
git push -u origin feature/my-feature

# Create PR
gh pr create --fill

# Or with custom title/body
gh pr create --title "Add bitmap encoder" --body "..."
```

### Merging (Important!)

Use GitHub API to avoid checkout conflicts in worktrees:

```bash
# Get PR number
gh pr list

# Merge via API (squash merge)
gh api repos/jwulff/signage/pulls/{number}/merge -X PUT -f merge_method=squash
```

**DO NOT** use `gh pr merge` - it tries to checkout main, which breaks worktrees.

**DO NOT** use `--admin` flag - it bypasses required reviews.

### PR Review Workflow

Before merging, ensure:

1. **CI passes** - All tests and lint checks green
   ```bash
   gh pr checks <number> --watch
   ```

2. **Copilot review complete** - Wait for automated review
   ```bash
   gh pr view <number> --json reviews
   ```

3. **All threads resolved** - Address any review comments
   ```bash
   gh api repos/jwulff/signage/pulls/{number}/comments
   ```

4. **Changes file exists** - Every PR needs a changes file

### PR Monitoring

When a PR is open, monitor it for review comments:

```bash
# Watch CI status
gh pr checks <number> --watch

# Check for new comments
gh pr view <number> --comments

# View inline code review comments
gh api repos/jwulff/signage/pulls/{number}/comments
```

Address all feedback before merging.

---

## Changes File Workflow

Every PR requires a changes file in `changes/`.

### Format

```markdown
# Brief Title

*Date: YYYY-MM-DD HHMM*

## Why
[Problem statement or feature rationale]

## How
[High-level approach and key decisions]

## Key Design Decisions
- [Decision 1 and rationale]
- [Decision 2 and rationale]

## What's Next
[Follow-up work or natural next steps]
```

### Naming

```
changes/YYYY-MM-DD-HHMM-brief-description.md
```

Example: `changes/2026-01-14-2100-initial-project-setup.md`

---

## Pixoo Protocol Reference

### Local API

```
Endpoint: POST http://<pixoo-ip>:80/post
Content-Type: application/json
```

### Send Frame Command

```json
{
  "Command": "Draw/SendHttpGif",
  "PicNum": 1,
  "PicWidth": 64,
  "PicOffset": 0,
  "PicID": 1,
  "PicSpeed": 1000,
  "PicData": "<base64-encoded-rgb-data>"
}
```

### RGB Data Format

- Resolution: 64×64 pixels
- Bytes per pixel: 3 (R, G, B)
- Total raw bytes: 64 × 64 × 3 = 12,288
- Encoding: Base64 (~16KB encoded)
- Pixel order: Left to right, top to bottom
- Byte order: [R0, G0, B0, R1, G1, B1, ...]

---

## Testing

### Run All Tests

```bash
pnpm test           # Run tests in all packages
pnpm lint           # Run linting across all packages
pnpm format:check   # Check formatting
pnpm format         # Auto-fix formatting
```

### Test Attestation

Commit messages MUST include test attestation. The pre-push hook enforces this.

```
[tests-passed: X tests in Ys]
```

### Commit Message Format

Follow this format for all commits:

```
<type>: <brief description>

<optional body explaining what and why>

[tests-passed: X tests in Ys]

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types:**
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `test:` - Test additions/changes

**Full Example:**
```
feat: add bitmap encoder

Implements RGB to base64 encoding for Pixoo frames.

- Added encodeBitmap() function in pixoo.ts
- Added unit tests for 64x64 frame encoding
- Handles edge cases for partial frames

[tests-passed: 12 tests in 0.8s]

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Test-Driven Development

Follow TDD for all changes:

1. **Write failing test** - Define expected behavior
2. **Run test, see it fail** - Confirm test is valid
3. **Implement minimum code** - Make the test pass
4. **Run test, see it pass** - Verify implementation
5. **Refactor** - Clean up while tests stay green
6. **Repeat** - Next test case

**Bug Fix Workflow:**
1. Write a test that reproduces the bug
2. See the test fail (confirms bug exists)
3. Fix the bug
4. See the test pass (confirms fix works)
5. Commit with test attestation

---

## Environment Variables

### SST Secrets

```bash
# Set secrets for production
sst secret set SOME_SECRET value --stage prod
```

### Local Development

Create `.env` files in package directories as needed (gitignored).

---

## Troubleshooting

### SST Issues

```bash
# Reset SST state
rm -rf .sst

# Check SST version
pnpm sst version
```

### Pixoo Connection

1. Ensure Pixoo is on same network
2. Find IP in Divoom app settings
3. Test with curl:
   ```bash
   curl -X POST http://<ip>/post -H "Content-Type: application/json" -d '{"Command":"Device/GetDeviceTime"}'
   ```

### WebSocket Testing

```bash
# Install wscat
npm install -g wscat

# Connect to WebSocket
wscat -c wss://xxx.execute-api.us-east-1.amazonaws.com/dev
```
