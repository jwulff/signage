# Security

This document records the results of a full security audit (codebase + all 373 commits
in git history) conducted on 2026-02-21 and the risk-acceptance decisions for each
finding.

## Remediated

### EXIF metadata in committed photo

`docs/images/pixoo-photo.jpg` contained EXIF data including precise GPS coordinates.
All EXIF metadata has been stripped from the current version. The original with GPS data
remains in git history — a full history rewrite is not warranted for this project.

## Accepted Risks

### Real health data fragments in git history

Deleted changes files in git history contain real glucose trajectories, insulin doses,
and carbohydrate totals used to document debugging sessions. These files have been
removed from the current tree but remain in git history. The values are isolated data
points without clinical context.

### Hardcoded user ID "john"

`DEFAULT_USER_ID = "john"` appears in several source files and the deploy workflow.
The owner's identity is already public via the LICENSE, README, and git commit metadata.

### Gendered pronouns in git history

Deleted changes files contain third-person pronouns referencing a family member in the
context of diabetes management. Same rationale as health data fragments above.

### Personal blog URL in README

The README links to a blog post on the project owner's personal domain. The blog post
is intentionally public.

### Full name in LICENSE

Standard for open-source projects.

### GitHub Actions pinned to version tags

Actions use `@v4` tags rather than full SHA hashes. Standard practice for most
open-source projects. Risk of tag-replacement attacks on first-party GitHub Actions is
low.

### No explicit permissions block in workflows

Workflows use default token permissions. The workflows do not perform privileged
operations beyond deployment.

### Partial credential logging

`packages/functions/src/dexcom/client.ts` logs the first few characters of the username
and password during authentication. These logs go to CloudWatch (encrypted, IAM-gated),
not the public repo.

### Health data logged to CloudWatch

Lambda functions log glucose values, insulin units, and carbohydrate grams to CloudWatch
for operational debugging. CloudWatch is encrypted at rest and access-controlled via IAM.

### Wildcard CORS on test/display endpoints

Several non-sensitive display endpoints use `Access-Control-Allow-Origin: *`. These
serve read-only display data and do not expose health data or accept mutations.

## Clean Findings

The following areas were confirmed clean:

- No hardcoded AWS credentials, API keys, tokens, or private keys anywhere in history
- No `.env` files with real values ever committed (only `.env.example` templates)
- No AWS account IDs in committed code (only placeholder `123456789012` in tests)
- `.gitignore` properly covers `.env`, `.env.local`, `node_modules/`, `.sst/`, etc.
- All runtime secrets (Dexcom, Glooko, Oura) use SST Secrets or environment variables
- Dependencies are well-maintained with no known vulnerabilities
- The Dexcom application ID is a well-known public value, not a secret

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately via
[GitHub Security Advisories](../../security/advisories/new) rather than opening a
public issue.
