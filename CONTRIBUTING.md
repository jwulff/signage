# Contributing to Signage

Thank you for your interest in contributing to Signage! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- AWS account with credentials configured (for deployment testing)
- [SST v3](https://sst.dev/) installed globally

### Setup

```bash
# Clone the repository
git clone https://github.com/jwulff/signage.git
cd signage

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build all packages
pnpm build
```

### Local Development (No AWS Required)

For quick iteration without deploying to AWS:

```bash
# Start local WebSocket server and web emulator
pnpm dev:local
```

This runs a local WebSocket server at `ws://localhost:8080` and the web emulator at `http://localhost:5173`.

## Development Workflow

### 1. Create a Branch

```bash
# Feature branches
git checkout -b feature/my-feature

# Bug fixes
git checkout -b fix/bug-description

# Maintenance
git checkout -b chore/task-description
```

### 2. Write Tests First (TDD)

We follow test-driven development. Write failing tests before implementing features.

```bash
# Run tests in watch mode
pnpm test:watch

# Run tests once
pnpm test
```

### 3. Make Your Changes

- Keep changes focused and minimal
- Follow existing code style
- Update documentation if needed

### 4. Commit Your Changes

```bash
git add .
git commit -m "feat: add new feature description"
```

Commit message format:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring

### 5. Push and Create a Pull Request

```bash
git push origin feature/my-feature
gh pr create --fill
```

## Project Structure

```
signage/
├── packages/
│   ├── core/           # Shared types and Pixoo protocol
│   ├── functions/      # Lambda handlers
│   ├── relay/          # CLI for Pixoo bridge
│   ├── web/            # React web emulator
│   └── local-dev/      # Local development server
├── infra/              # SST infrastructure definitions
└── changes/            # Changelog entries
```

## Testing

### Run All Tests

```bash
pnpm test
```

### Run Tests for Specific Package

```bash
pnpm --filter @signage/core test
pnpm --filter @signage/functions test
```

## Code Style

- TypeScript for all source code
- ESM modules (`"type": "module"`)
- Consistent formatting (follow existing patterns)

## Pull Request Guidelines

1. **Keep PRs focused** - One feature or fix per PR
2. **Include tests** - All new features should have tests
3. **Update docs** - Update README if adding user-facing features
4. **Pass CI** - All tests must pass before merge

## Questions?

Open an issue if you have questions or need clarification on anything.
