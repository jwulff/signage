# Initial Project Setup

*Date: 2026-01-14 2100*

## Why

Starting a new personal digital signage system to display dynamic content on a Pixoo64 LED matrix and web emulator. The goal is a reliable, serverless architecture that can:

1. Push bitmap frames to physical Pixoo64 device
2. Display same content in web emulator for development
3. Support multiple widget data sources (weather, calendar, etc.)
4. Scale to multiple terminals with different sizes

Inspired by Aaron Patterson's Pixoo64 Ruby client blog post.

## How

Set up the foundational infrastructure:

1. **Repository structure**: Git worktree-based development pattern (matching tidbits/hexaconia)
2. **Monorepo**: pnpm workspaces with four packages (core, functions, relay, web)
3. **Infrastructure**: SST v3 for serverless AWS (WebSocket API, DynamoDB, CloudFront)
4. **CI/CD**: GitHub Actions for testing and deployment
5. **Documentation**: Comprehensive CLAUDE.md and DESIGN.md

## Key Design Decisions

- **Local relay agent**: The Pixoo sits behind NAT, so we need a local process to bridge AWS WebSocket to the device's HTTP API. This is the same pattern used by most smart home systems.

- **Frame buffer as source of truth**: Rather than pushing partial widget updates, the system will re-compose the entire frame whenever any widget updates. This ensures consistency and simplifies the protocol.

- **SST v3 over CDK/SAM**: SST provides better DX for serverless development with live Lambda reloading and simpler configuration.

- **WebSocket over HTTP polling**: Real-time frame updates require push semantics. WebSocket is well-supported by API Gateway and allows bidirectional communication.

## What's Next

1. Deploy infrastructure and verify WebSocket connectivity
2. Test relay CLI with real Pixoo device
3. Implement connection management in Lambda handlers
4. Create test bitmap endpoint
5. End-to-end test: Lambda → WebSocket → Relay → Pixoo
