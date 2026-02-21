# Security Audit and SECURITY.md

*Date: 2026-02-21 1100*

## Why
As an OSS project, we need to document that a security audit has been performed and
that known findings have been reviewed and either remediated or explicitly accepted.

## How
- Scanned all 373 commits and full git history for secrets, credentials, PII, and PHI
- Stripped EXIF/GPS metadata from `docs/images/pixoo-photo.jpg`
- Created `SECURITY.md` documenting all findings and risk-acceptance decisions

## Key Design Decisions
- Stripped GPS data from the photo (only finding worth remediating)
- Accepted all other findings (identity linkage, health data fragments in history,
  tag-pinned actions, etc.) as low-risk given the project context
- Did not rewrite git history — not warranted for this project

## What's Next
- Re-audit periodically as new code is added
