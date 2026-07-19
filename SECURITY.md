# Security Policy

## Supported Versions

This project is pre-1.0 and does not yet maintain parallel maintenance branches. Security fixes are applied to the latest release on `main` only.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x: |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report privately to: **<CONTACT>**

Include, where possible:

- A description of the vulnerability and its potential impact
- Steps to reproduce (a minimal repro is very helpful)
- The affected component (Host / web / app) and version/commit
- Whether the issue requires non-default configuration to trigger (e.g. `CMS_HOST=0.0.0.0`)

You should receive an initial response within a reasonable timeframe. If the report is confirmed, we will work on a fix and coordinate disclosure timing with you before any public write-up.

## Known Security Boundaries

The Host (`host/`) is designed for **local/trusted-network use**, not as a public-facing service. The following boundaries are by design, not oversights — please read before filing a report:

- **Loopback by default**: the Host binds to `127.0.0.1` unless `CMS_HOST=0.0.0.0` is explicitly set. Binding to all interfaces is an opt-in, at-your-own-risk operation intended for same-LAN phone/App access — see [docs/DEPLOY.md](docs/DEPLOY.md#环境变量).
- **Token-based pairing, not a full auth system**: non-loopback requests must present `CMS_TOKEN` (via query param, header, or a cookie set after first successful pairing). This is a shared-secret pairing token for casual LAN use, **not** a substitute for real authentication/authorization (no per-user accounts, no rotation/expiry beyond process restart, no rate limiting). Do not expose the Host beyond a trusted LAN.
- **LAN-only threat model**: the pairing flow (`/pair`, `/api/pair`) is itself restricted to loopback requests so the QR/token cannot be fetched from the network; but once `CMS_HOST=0.0.0.0` is set and a token is shared, anyone on the same network segment who obtains that token can act as a paired client. There is no protection against a compromised or hostile device on the same LAN.
- **Remote key injection is scoped to tmux/cmux sessions**: "remote" actions (accept/reject/voice dictation) only ever inject keystrokes into a session that is running inside **tmux** (`tmux send-keys`) or **cmux** (`cmux send` / `send-key --surface`). Sessions not running in one of these multiplexers cannot receive injected input — the Host will report this rather than silently failing. This is an intentional scope limit, not partial coverage of a broader goal.
- **Status lights are event-driven, never terminal-text-derived**: agent state (idle/running/needs_input/complete/unknown) is driven exclusively by official Claude Code / Codex hook and notify events, never by scraping or inferring from terminal output — this avoids a class of spoofing/parsing bugs by construction.

If you believe one of these documented boundaries can be bypassed (e.g. token exposed to non-loopback requests, injection reaching a session outside tmux/cmux, or state derived from untrusted terminal content), that **is** a valid report — please send it privately as above.

For the full deployment/environment-variable reference, see [docs/DEPLOY.md](docs/DEPLOY.md).
