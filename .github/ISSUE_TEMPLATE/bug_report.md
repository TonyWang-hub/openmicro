---
name: Bug report
about: Report a problem with the Host, web client, or native app
title: "[Bug] "
labels: bug
assignees: ''
---

## Describe the bug

A clear and concise description of what the bug is.

## Component

Which part of the project is affected? (check all that apply)

- [ ] Host (`host/`, Node.js)
- [ ] Web client (`web/`)
- [ ] Native app (`app/`, Flutter)
- [ ] Docs

## To Reproduce

Steps to reproduce the behavior:

1. Start Host with '...'
2. Open '...'
3. Click/do '...'
4. See error

## Expected behavior

A clear and concise description of what you expected to happen.

## Actual behavior

What actually happened. Include error messages, stack traces, or relevant log output (redact tokens/IPs if sharing logs).

## Screenshots

If applicable, add screenshots to help explain your problem.

## Environment

**Host:**
- OS: [e.g. macOS 15, Ubuntu 24.04]
- Node.js version: `node -v`
- `CMS_HOST` / `CMS_PORT` in use: [loopback default / 0.0.0.0]
- Session runner: [tmux / cmux / neither]
- Agent(s) involved: [claude-code / codex]

**Web client (if applicable):**
- Browser + version:
- Page: [`/` desktop pane / `/m` mobile toy] — Demo or Live mode?

**Native app (if applicable):**
- Platform: [Android / iOS]
- OS version:
- Device: [physical device / simulator/emulator]
- Flutter version: `flutter --version`

## Additional context

Add any other context about the problem here (e.g. relevant section of `docs/ARCHITECTURE.md` or `docs/DEPLOY.md`).
