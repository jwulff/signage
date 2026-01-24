# Open Source Preparation

*Date: 2026-01-21 2126*

## Why

Preparing the repository for public open source release. Needed to remove personal information, add comprehensive documentation for new users, and ensure the codebase is safe to share publicly.

## How

Documentation:
1. Comprehensive README rewrite with fork & deploy instructions
2. Added prerequisites checklist with version requirements
3. Step-by-step AWS account setup with IAM policy
4. Domain configuration guide (custom or default AWS URLs)
5. GitHub Actions secrets setup instructions
6. Data source configuration (Dexcom, Oura)
7. Architecture overview with AWS services and cost estimates
8. Troubleshooting guide

Security:
1. Added public repository security warnings to CLAUDE.md
2. Created checklist of what never to commit (secrets, personal info)
3. Documented secret rotation procedures if accidentally committed
4. Replaced personal domain with example.com throughout codebase
5. Added project images and blog post link to README

## Key Design Decisions

- Used example.com for all domain references per RFC 2606
- Kept IAM policy minimal but sufficient for SST deployments
- Documented both custom domain and AWS-default-URL deployment paths
- Added cost estimates so users know what to expect (~$5-10/month)
- Security warnings placed prominently at top of CLAUDE.md

## What's Next

- Add CONTRIBUTING.md for external contributors
- Consider adding GitHub issue templates
- Could add architecture diagrams
