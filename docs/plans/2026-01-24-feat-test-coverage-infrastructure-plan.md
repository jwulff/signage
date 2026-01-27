---
title: Add Test Coverage Infrastructure
type: feat
date: 2026-01-24
deepened: 2026-01-24
---

# Add Test Coverage Infrastructure

## Enhancement Summary

**Deepened on:** 2026-01-24
**Research agents used:** best-practices-researcher, kieran-typescript-reviewer, performance-oracle, code-simplicity-reviewer, architecture-strategist, pattern-recognition-specialist, Context7

### Key Improvements

1. **Phased threshold approach** - Start with current baseline, not immediate 90%
2. **CI enforcement over pre-push** - Keep local development fast
3. **Global threshold** - Single threshold with package exclusions (simpler than per-package)
4. **Clean configuration** - Explicit `isCI` check, consistent exclusions

### Critical Issues Discovered

- 90% threshold on packages with 0 tests will **block all pushes immediately**
- Pre-push coverage checks add friction; CI is the right enforcement point
- Branch coverage often harder to achieve than statement coverage

---

## Overview

Add comprehensive test coverage reporting and enforcement to the signage monorepo using Vitest's built-in v8 coverage provider. Use a **phased approach**: measure baseline first, then set graduated thresholds per package.

## Problem Statement / Motivation

The codebase has 165 tests across 15 test files, but no visibility into actual code coverage. Without coverage metrics:
- No way to identify untested code paths
- Regressions can slip in undetected
- Quality bar is implicit rather than enforced

Adding coverage infrastructure aligns with the existing rigorous development process (TDD, pre-push hooks, test attestation).

## Proposed Solution

### Phase 1: Measure (This PR)

1. **Install `@vitest/coverage-v8`** as root dev dependency
2. **Create root `vitest.config.ts`** with coverage enabled but **no thresholds**
3. **Add `test:coverage` script** that runs coverage across all packages
4. **Run baseline** to see current coverage state

### Phase 2: Enforce (Follow-up PR)

5. **Set thresholds** based on actual baseline (per-package)
6. **Add CI job** that enforces thresholds on PRs
7. **Update pre-push hook** (optional, keep fast)

### Phase 3: Grow (Incremental)

8. **Ratchet up thresholds** quarterly as coverage improves
9. **Add tests** to `web` and `local-dev` packages

### Research Insights

**Best Practices:**
- Use `include` patterns first, then `exclude` for edge cases
- V8 provider is 2-3x faster than Istanbul with equal accuracy since Vitest 3.2
- Set `perFile: true` to catch low-coverage files hiding in aggregate

**Performance Considerations:**
- V8 coverage adds ~30-50% overhead (830ms → ~1,100ms)
- Use `reporter: ['text']` locally; add HTML/lcov only in CI
- Enable parallel package execution for 3-4x speedup

**Anti-patterns to Avoid:**
- Uniform 90% threshold across heterogeneous packages
- Pre-push blocking that encourages `--no-verify`
- Statement-only coverage hiding untested branches

---

## Technical Considerations

### Package Coverage State

| Package | Current Tests | Phase 1 | Phase 2 |
|---------|---------------|---------|---------|
| `@signage/core` | 6 test suites | Measure | Include in global threshold |
| `@signage/functions` | 10+ test files | Measure | Include in global threshold |
| `@signage/relay` | 2 test files | Measure | Include in global threshold |
| `@signage/web` | 0 tests | Measure | Exclude until tests added |
| `@signage/local-dev` | 0 tests | Exclude | Exclude (dev tooling) |

### Threshold Strategy

**Global threshold approach** (simpler than per-package):
- Measure baseline in Phase 1
- Set global threshold at baseline minus 2-5%
- Exclude `web` and `local-dev` from coverage entirely
- Ratchet up threshold as coverage improves

**Code Example - Configuration:**

```typescript
// vitest.config.ts
import { defineConfig, coverageConfigDefaults } from 'vitest/config'

const isCI = process.env.CI === 'true'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: isCI ? ['text', 'json', 'lcov'] : ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        ...coverageConfigDefaults.exclude,
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        '**/*.d.ts',
        '**/types/**',
        '**/__mocks__/**',
        '**/*.config.ts',
      ],
      // Phase 1: No thresholds - just measure
      // Phase 2: Add global threshold based on baseline
    },
  },
})
```

### v8 Provider Considerations

**When v8 Works Well:**
- Node.js code (all signage packages)
- TypeScript with source maps enabled
- Lambda handlers, CLI tools, utilities

**When v8 May Need Adjustment:**
- Browser-specific React code in `@signage/web`
- If web package tests use jsdom, v8 works fine for business logic
- Istanbul is alternative if v8 has issues with JSX instrumentation

### Pre-push Hook Strategy

**Research Finding:** Pre-push coverage checks create workflow friction and encourage `--no-verify` bypass.

**Recommended Approach:**
- **Pre-push:** Keep running `pnpm test` (fast feedback, ~830ms)
- **CI:** Run `pnpm test:coverage` with threshold enforcement
- **Optional:** Add coverage to pre-push later if team wants it

---

## Acceptance Criteria

### Phase 1: Measure

- [ ] `pnpm test:coverage` runs coverage for all packages from root
- [ ] Text summary printed to terminal with per-package breakdown
- [ ] HTML reports generated in `coverage/` directory
- [ ] Baseline coverage numbers documented

### Phase 2: Enforce

- [ ] Per-package thresholds configured based on baseline
- [ ] CI job fails when thresholds not met
- [ ] Clear error messages show which package/metric failed

### Configuration Requirements

- [ ] `@vitest/coverage-v8` added to root devDependencies
- [ ] `vitest.config.ts` created at repo root with type-safe config
- [ ] `test:coverage` script added to root `package.json`
- [ ] Coverage exclusions include: `**/*.test.ts`, `**/*.d.ts`, `**/__mocks__/**`, `**/*.config.ts`, `**/types/**`

### Quality Gates

- [ ] Existing 165 tests still pass with coverage enabled
- [ ] Coverage reports accessible at `coverage/index.html`
- [ ] No performance regression > 50% on test runs

---

## Implementation Details

### Vitest Configuration

**File: `vitest.config.ts` (new)**

```typescript
import { defineConfig, coverageConfigDefaults } from 'vitest/config'

const isCI = process.env.CI === 'true'

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/src/**/*.spec.ts',
    ],

    coverage: {
      provider: 'v8',
      reporter: isCI ? ['text', 'json', 'lcov'] : ['text', 'html'],
      reportsDirectory: './coverage',

      include: [
        'packages/core/src/**/*.ts',
        'packages/functions/src/**/*.ts',
        'packages/relay/src/**/*.ts',
        'packages/web/src/**/*.{ts,tsx}',
      ],

      exclude: [
        ...coverageConfigDefaults.exclude,
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        '**/*.d.ts',
        '**/types/**',
        '**/__mocks__/**',
        '**/*.config.ts',
        '**/index.ts',
      ],

      // Phase 2: Add global threshold based on baseline
      // thresholds: {
      //   lines: 80,
      //   branches: 75,
      //   functions: 80,
      //   statements: 80,
      // },
    },
  },
})
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Performance Optimizations

**Research Insights:**

| Optimization | Impact | Implementation |
|--------------|--------|----------------|
| V8 over Istanbul | 2-3x faster | Default in config |
| Text reporter locally | 30% faster | Conditional in config |
| Parallel packages | 3-4x faster | Default pnpm behavior |
| Skip uncovered files | 10-20% faster | `all: false` (default) |

**Expected Performance:**
- Current test runtime: ~830ms
- With coverage (unoptimized): ~1,300ms
- With coverage (optimized): ~1,100ms

---

## Success Metrics

- All tested packages report coverage percentages
- Baseline coverage documented for planning targets
- CI blocks PRs that reduce coverage below thresholds
- Developers can view HTML coverage reports locally

---

## Dependencies & Risks

### Dependencies

- Vitest 2.1.0+ (already installed)
- Node.js 20+ (already required)

### Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| 0-test packages fail threshold | **High** | Phase 2 uses per-package thresholds starting at 0% |
| Pre-push slows development | **Medium** | Enforce in CI only, keep pre-push fast |
| Coverage adds overhead | **Low** | V8 is ~30-50% overhead, acceptable |
| Branch coverage hard for rendering | **Low** | Set branch threshold 5-10% lower than lines |

---

## Implementation Order

### Phase 1 (This PR)

1. Install `@vitest/coverage-v8` dependency
2. Create `vitest.config.ts` with coverage settings (no thresholds)
3. Add `test:coverage` script to root `package.json`
4. Run baseline coverage and document results
5. Commit changes file

### Phase 2 (Follow-up PR)

6. Add per-package thresholds based on baseline
7. Add CI workflow step for coverage enforcement
8. Update CLAUDE.md with coverage guidelines

### Phase 3 (Incremental)

9. Quarterly: Ratchet thresholds up by 5-10%
10. Add tests to `web` package when needed
11. Consider adding pre-push coverage (optional)

---

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `@vitest/coverage-v8` devDep, add `test:coverage` script |
| `vitest.config.ts` | Create with coverage config (new file) |
| `.github/workflows/ci.yml` | Add coverage step (Phase 2) |

**Note:** Pre-push hook unchanged in Phase 1 to keep local development fast.

---

## Edge Cases

### Research Insights

| Edge Case | Handling |
|-----------|----------|
| Package with 0 tests | Exclude from threshold or set to 0% |
| Generated code | Exclude via `**/generated/**` pattern |
| Type-only files | Exclude via `**/*.d.ts` pattern |
| Re-export index files | Exclude via `**/index.ts` pattern |
| CI vs local reporters | Conditional based on `process.env.CI` |

---

## References & Research

### Internal References

- Pre-push hook: `.githooks/pre-push:94` (current test command)
- Test scripts: `package.json` (root `"test": "pnpm -r test"`)
- Gitignore: `.gitignore:28-29` (coverage/ already ignored)

### External References

- [Vitest Coverage Documentation](https://vitest.dev/guide/coverage)
- [v8 Coverage Provider](https://vitest.dev/guide/coverage#coverage-providers)
- [Vitest Coverage Config](https://vitest.dev/config/coverage)
- [Improving Vitest Performance](https://vitest.dev/guide/improving-performance)

### Related Work

- Brainstorm: `docs/brainstorms/2026-01-24-test-coverage-brainstorm.md`

### Research Agents Used

- **best-practices-researcher**: Vitest coverage patterns, v8 vs Istanbul
- **kieran-typescript-reviewer**: Type-safe configuration, ESM considerations
- **performance-oracle**: Coverage overhead analysis, optimization strategies
- **code-simplicity-reviewer**: YAGNI analysis, phased approach recommendation
- **architecture-strategist**: Monorepo coverage patterns, workspace configuration
- **pattern-recognition-specialist**: Anti-patterns, threshold strategies
