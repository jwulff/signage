# Pipeline Documentation

*Date: 2026-01-15 0700*

## Why

The signage system was fully functional but undocumented. New users (or future self) would have no way to understand how to use the system without reading through source code.

Issue #30 required documenting the working pipeline with examples.

## How

Created comprehensive README.md covering:

1. **Architecture overview** - ASCII diagram showing data flow
2. **Quick start** - Three commands to see the system work
3. **Test endpoint** - Full parameter documentation with curl examples
4. **Relay CLI** - Installation, usage, and feature documentation
5. **Development setup** - Prerequisites, commands, deployment
6. **Deployed URLs** - All production endpoints in one table

## Key Design Decisions

- **Quick start first**: Users can see something working in 30 seconds before diving into details
- **Curl examples**: No dependencies needed to test - just copy/paste
- **ASCII diagram**: Works in terminal, GitHub, and any text editor
- **Single README**: Everything in one place rather than scattered docs

## What's Next

- Add demo GIF to README (requires screen recording)
- Consider adding widget development guide when widgets are built
- Keep deployed URLs updated if infrastructure changes
