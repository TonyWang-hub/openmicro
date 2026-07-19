# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Governance and CI scaffolding (LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates, GitHub Actions workflow).

## [0.1.0] - 2026-07

Initial public-facing snapshot: a software simulator that remotely monitors and controls local `claude`/`codex` agent sessions from a phone or browser, without requiring the physical Codex Micro hardware keyboard.

### Added

- **Host** (`host/`, Node.js): single source of truth ingesting official Claude Code / Codex hook events, tracking a 6-slot session state machine, and routing remote commands back into the originating session.
- **Auto-claimed slots**: any new `claude`/`codex` session is automatically assigned a free slot keyed by `session_id`, labeled by project (`cwd`), with LRU eviction once all 6 slots are in use — no manual per-project `sessionKey` configuration required.
- **tmux/cmux key injection**: remote accept/reject and voice-dictated input are injected into the real session via `tmux send-keys` or `cmux send` / `send-key --surface`, scoped strictly to sessions running in one of those multiplexers.
- **Web client** (`web/`): desktop dev pane (`web/index.html`, keyboard + live `xterm.js` terminal) and a mobile "toy" pane (`web/m.html` + `web/toy/`) with Demo (offline, scripted) and Live (connected to the real Host) modes.
- **Native Flutter app** (`app/`): Android/iOS client reusing the same Host and WS contract, adding real haptics, synthesized key-click sound (playback wiring pending), QR-code pairing, and speech-to-text voice dictation.
- **Remote capabilities**: status-light monitoring (lights + LCD-style status text), accept/reject approval routing, voice-dictated task injection, and QR-code based pairing for LAN access.
- Explicit-focus safety rule: command keys only ever act on the agent light the user explicitly selected, enforced client-side before any command is sent.

[Unreleased]: https://github.com/TonyWang-hub/openmicro/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/TonyWang-hub/openmicro/releases/tag/v0.1.0
