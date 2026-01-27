# Test Coverage Infrastructure

**Date:** 2026-01-24
**Status:** Ready for planning

## What We're Building

A comprehensive test coverage workflow for the signage monorepo:

1. **Coverage Reporting** - Generate HTML reports in `coverage/` (gitignored) using Vitest's built-in coverage
2. **Gap Identification** - Identify uncovered code paths across all 5 packages
3. **CI Enforcement** - Block commits/PRs that drop coverage below 90% threshold

## Why This Approach

### Local-Only Reports
- No external dependencies (Codecov, Coveralls)
- Fast iteration - view reports immediately after test runs
- Privacy - health data code patterns stay local
- Simpler CI - no API tokens or service configuration

### Uniform 90% Threshold
- Matches existing quality bar (TDD, pre-push hooks, test attestation)
- All packages treated equally - core, functions, relay, web, local-dev
- Strict threshold catches regressions early
- Consistent expectations across codebase

### Vitest Native Coverage
- Already using Vitest for tests
- Built-in `@vitest/coverage-v8` provider
- Integrates with existing `pnpm test` commands
- No additional test runners needed

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Coverage provider | Vitest v8 | Already using Vitest, zero additional deps |
| Report location | `coverage/` (gitignored) | Local-first, privacy-preserving |
| Report format | HTML + text summary | Visual exploration + CI parsing |
| Threshold | 90% uniform | Matches strict quality culture |
| Enforcement | Pre-push hook + CI | Dual gates prevent regressions |

## Approach

### 1. Configure Vitest Coverage
Add coverage configuration to `vitest.config.ts` at root:
- Enable v8 provider
- Set 90% threshold for lines, functions, branches, statements
- Output HTML to `coverage/` directory
- Add text reporter for CI summary

### 2. Update Package Scripts
- Add `test:coverage` script to root `package.json`
- Each package runs its tests with coverage enabled
- Aggregate reports at monorepo level

### 3. Extend Pre-Push Hook
- Run `pnpm test:coverage` instead of `pnpm test`
- Fail push if coverage below threshold
- Include coverage summary in commit attestation

### 4. Gitignore Coverage Directory
- Add `coverage/` to `.gitignore`
- Reports regenerated on each run

## Open Questions

1. **Current baseline** - What's the actual coverage today? May already be near 90%
2. **Package-level vs aggregate** - Enforce per-package or total monorepo coverage?
3. **Branch coverage weight** - Is 90% branch coverage realistic for rendering logic?
4. **Exclusions** - Should generated code or test utilities be excluded?

## Out of Scope

- Third-party coverage services
- Badge generation
- Coverage trending over time
- PR-specific coverage diffs

## Next Steps

Run `/workflows:plan` to create implementation tasks.
