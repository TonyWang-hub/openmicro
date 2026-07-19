# OpenMicro — A Software Remote for Your Local Coding Agents

[![CI](https://github.com/TonyWang-hub/openmicro/actions/workflows/ci.yml/badge.svg)](https://github.com/TonyWang-hub/openmicro/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/live_demo-online-brightgreen)](https://TonyWang-hub.github.io/openmicro/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Flutter](https://img.shields.io/badge/Flutter-iOS%20%7C%20Android-02569B?logo=flutter&logoColor=white)](https://flutter.dev/)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8)](web/toy/manifest.json)

> 🎛️ **Remote-control your local `claude` and `codex` from phone, web, or a native app.** Six lights track every agent session in real time; the keys inject accept / reject / voice commands straight back into the real terminal — no leaning over the keyboard, no manually typing.
>
> The real Codex Micro's "intelligence" lives entirely in the ChatGPT desktop app; the hardware is just an HID keypad + RGB lights. OpenMicro reproduces the same interaction in pure software (a Host service + web / native apps), and works with Claude Code too.
>
> **Keywords**: OpenMicro, Codex Micro, Claude Code, Codex, agent macropad, coding agent remote, AI agent control, skeuomorphic keyboard, tmux, cmux, Claude Code hooks, voice dispatch, PWA, Flutter, phone remote for AI agents

**English** | [简体中文](README.md)

> **Tribute**: Inspired by the sold-out $230 "Codex Micro" agent macropad — but **not** an official product, **not** affiliated with OpenAI / Work Louder, and it ships **no** hardware. "Codex" and "Codex Micro" are trademarks of their respective owners. The code keeps an internal `cms` prefix for historical reasons; it has no bearing on the public name.

---

## Table of Contents

- [What is OpenMicro?](#what-is-openmicro)
- [What Problem It Solves](#what-problem-it-solves)
- [Preview](#preview)
- [The Three Surfaces](#the-three-surfaces)
- [Quick Start](#quick-start)
- [Docker](#docker)
- [Core Concepts](#core-concepts)
- [Capability Matrix](#capability-matrix)
- [Security](#security)
- [FAQ](#faq)
- [Roadmap](#roadmap)
- [Related / Sibling Projects](#related--sibling-projects)
- [Citation](#citation)
- [License](#license)

---

## What is OpenMicro?

OpenMicro is a **three-surface software remote** that maps every coding-agent session running on your machine (Claude Code / Codex) to six live lights, and lets you inject approvals and voice commands back into the real terminal from your phone, browser, or a native app:

- **Host (Node service)** — the single source of truth: receives the agents' official hook events, maintains a 6-slot state machine, injects commands back into tmux / cmux.
- **Web** — no install; open a link or scan a QR code. Ships a desktop dev console and a phone skeuomorphic "toy" page, with Demo / Live modes.
- **Native app (Flutter, iOS / Android)** — a tactile upgrade over the web: real haptics, synthesized mechanical key sounds, QR pairing, and speech-to-text dispatch.

> **▶︎ Live demo (no install, no backend)**: <https://TonyWang-hub.github.io/openmicro/> — the phone Demo mode with fake agents acting out the lights and approvals. Best opened on a phone.

<p align="center">
  <img src="docs/media/openmicro-web-demo.gif" width="320" alt="OpenMicro web demo — 6 lights tracking fake agent sessions, tap to approve/reject" />
  <br/>
  <em>Demo mode: six lights animate agent session states; tap to approve, hold to voice-dispatch.</em>
</p>

## What Problem It Solves

When you run several coding agents at once, you keep switching windows to check which one is waiting on you, which is stuck, which just finished. OpenMicro turns that into **glance at the lights + one-tap approval**:

- **Watch the lights** — any claude / codex started in any directory auto-claims a light, labeled by project (cwd), its state shown in five colors in real time — no window-polling.
- **One-tap approval** — after selecting a light, the command keys send accept / reject / voice straight back to that session's terminal.
- **Always within reach** — treat your phone as a physical remote on the desk, or just scan a QR and use the web — approvals no longer require returning to the keyboard.

## Preview

<table>
<tr>
<td align="center"><b>Web Demo (browser · fake agents)</b></td>
<td align="center"><b>Native App (iOS / Android · haptics)</b></td>
</tr>
<tr>
<td align="center"><img src="docs/media/openmicro-web-lights.png" width="300" alt="Web demo: six keys lit as THINKING / NEEDS INPUT etc." /></td>
<td align="center"><img src="docs/media/openmicro-ios-keyboard.png" width="300" alt="Native app skeuomorphic keyboard, 6 slots lit live after connecting to Host" /></td>
</tr>
</table>

> The GIF is at the top; `docs/media/openmicro-web-demo.mp4` is a lighter (254 KB) social-friendly version. Both stills are lit: the web one is Demo mode with fake agents; the app is the native client connected to a Host, six slots reflecting real sessions (blue = thinking / amber = needs your input / pink = error).

## The Three Surfaces

```
┌─────────────┐   HTTP hook forward   ┌───────────────────┐   WS state broadcast  ┌──────────────┐
│ claude/codex │ ────────────────────▶│   Host (Node)      │──────────────────────▶│  Web / App    │
│ (real session)│◀──────────────────── │ ingest→store→router │◀─────────────────────│ lights/keys/voice│
└─────────────┘   tmux/cmux key inject └───────────────────┘   WS commands         └──────────────┘
```

| Surface | Dir | Form | Role |
|---|---|---|---|
| **Host** | `host/` | Node.js service (HTTP + WebSocket) | Single source of truth: ingests hook events, maintains the 6-slot state machine, injects approvals / voice into tmux / cmux |
| **Web** | `web/` | Two pages: `web/index.html` (desktop dev console — keyboard left, real xterm.js terminal right) and `web/toy/*` + `web/m.html` (phone 1:1 skeuomorphic toy, portrait, Demo / Live) | No app to install; scan a QR or open a link |
| **Native app** | `app/` (Flutter) | iOS / Android | A tactile upgrade: real haptics (CoreHaptics / VibrationEffect), synthesized key sounds, QR pairing, speech-to-text dispatch; reuses the same Host with zero server changes |

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full architecture, module list, and key design decisions.

## Quick Start

### 1. Start the Host

```bash
npm install
npm start
```

Or the one-shot script (checks node / jq / curl, loads `.env` if present, installs deps only when `node_modules` is missing, starts and prints the pairing hint):

```bash
cp .env.example .env   # optional; defaults work without it
bash scripts/start.sh
```

Open `http://127.0.0.1:7788` (desktop dev console — keyboard left, real terminal right). The Host binds `127.0.0.1` only by default; to let a phone connect, restart with `CMS_HOST=0.0.0.0` (see [docs/DEPLOY.md](docs/DEPLOY.md)).

### 2. Install global hooks (auto-track every claude / codex session)

Install once; afterward any claude / codex started in **any directory** auto-claims a light, is labeled by project (cwd), and older idle slots are LRU-recycled past 6 — no per-project sessionKey wiring. Steps (hook JSON snippets, uninstall) are in **[docs/DEPLOY.md](docs/DEPLOY.md#全局-hooks-安装)**.

### 3. Open the web on your phone, or connect via the app

```bash
# Demo mode (zero config — 6 fake agents acting out states, with sound + haptics):
#   http://127.0.0.1:7788/m
# Live mode (lights wired to your real agents, CLI injection):
#   CMS_HOST=0.0.0.0 CMS_TOKEN=your_token npm start
#   open http://<LAN-IP>:7788/pair on your computer for a QR → scan from the phone
```

Native app (Flutter): `cd app && flutter run`, then paste the pairing link from the `/pair` page or scan the QR. Build / device details in [docs/DEPLOY.md](docs/DEPLOY.md#app-构建).

## Docker

The containerized Host suits "monitor-only" scenarios (e.g. a always-on box for a pure lights display), not remote key injection.

```bash
cp .env.example .env   # pin at least a CMS_TOKEN
docker compose up --build
```

LAN access: `http://<host-IP>:7788/m?token=<CMS_TOKEN>&live=1`.

> ⚠️ **Boundary: the container can only monitor, not inject keys.** accept / reject / voice rely on `tmux send-keys` or the cmux CLI sending keys back to the real session's terminal — and that tmux session / cmux process runs on the **host machine**, which the container can't reach (no host tmux socket, no host cmux process). Lights (hook events lighting the 6-slot state machine) work fine in the container, but pressing accept / reject or voice returns "not in tmux / cmux, cannot inject remotely". For full capability, run the Host directly on the host machine via `scripts/start.sh` from Quick Start. See the header comment in [Dockerfile](Dockerfile).

## Core Concepts

- **Auto-claimed slots (session_id auto-assignment)** — Claude Code / Codex hook events carry a `session_id` (per-session UUID) and `cwd`. The first time the Host sees a `session_id`, it auto-claims a free slot (`slotId` 0–5); once all 6 are taken it LRU-evicts the oldest idle slot (`needs_input` is protected). No manual `sessionKey` binding per project.
- **cmux / tmux injection** — lights are driven **only** by official hook / notify events (**never** inferred from terminal text). "Remote keys" (accept / reject / voice) require sending keys back to that session's terminal — which means the session must run inside **tmux** (`tmux send-keys`) or **cmux** (a GUI multiplexer: `cmux send` / `send-key --surface`). With neither, you can still watch the lights; keys report "cannot inject remotely". With both, cmux wins (that's where the real TUI lives).
- **Explicit-focus safety** — command keys (◎✓ accept / ⊗ reject / ⚡ quick / 🎙 voice) act only on the Agent light you **explicitly select**, never auto-picking — preventing misfires into the wrong session or chat window. Full contract in [docs/COMMANDS.md](docs/COMMANDS.md).

## Capability Matrix

| Capability | Prerequisite | Notes |
|---|---|---|
| **Monitoring (lights + LCD text)** | Any claude / codex session with global hooks installed | session_id auto-claims a slot, cwd labels the project. This is the core value and is independent of tmux / cmux |
| **Remote ◎✓ / ⊗ from phone / app (accept / reject)** | The session runs in **tmux or cmux** | Injection needs a real pane / surface target; non-tmux/cmux sessions are lights-only (keys no-op with a hint, not an error) |
| **🎙 Voice dispatch (type what you say into the terminal)** | Same (tmux / cmux) + browser / app speech recognition | Web uses the Web Speech API (`webkitSpeechRecognition`, with a keyboard fallback hint); the app uses `speech_to_text` |
| **💭 New session / ⤴ in-project fork** | Host can call `tmux new-session` or `cmux workspace create` | New sessions light up automatically via hooks — no manual binding |

The WS command contract (payload / behavior / failure path per action) is in **[docs/COMMANDS.md](docs/COMMANDS.md)**.

## Security

- 🔒 **Loopback by default** — the Host binds `127.0.0.1`; phone access requires an explicit `CMS_HOST=0.0.0.0` + token.
- 🎟️ **Pairing token** — Live mode requires a token; LAN sub-resources use cookie auth. Origin validation + per-IP rate limiting are available opt-in.
- 📡 **Fully local, no cloud** — data never passes through any third-party server; lights are driven only by your local agents' hooks.
- 👁️ **Only trusts self-reported injection targets** — `tmuxTarget` / `cmuxTarget` come entirely from the session's own forwarder; the Host never accepts externally supplied injection targets, so commands can't be misrouted to another window.

Report vulnerabilities via a private GitHub Security Advisory — see [SECURITY.md](SECURITY.md).

## FAQ

**Q: Do I need to buy the Codex Micro hardware?**
A: No. OpenMicro is pure software, running on your existing computer + phone / browser.

**Q: What's the relationship to the real Codex Micro?**
A: It only **reimplements the interaction in software** (lights + approvals + voice dispatch). It is not an official product, not affiliated with OpenAI / Work Louder, and ships no hardware.

**Q: Which agents are supported?**
A: Claude Code and Codex, via their official hook / notify events. Light states are **never** inferred from screen text — only driven by official events.

**Q: Can the phone always inject keys?**
A: Watching lights always works; but remote accept / reject / voice requires the session to run in tmux or cmux (injection needs a real terminal target). Otherwise it's lights-only.

**Q: Does any data go to the cloud?**
A: No. The Host binds loopback by default; all data flows on your machine, never through a third-party server.

**Q: Demo vs Live mode?**
A: Demo is a zero-config fake-agent showcase (scan and play); Live wires the lights to your real agent sessions, requires a token, and needs the session in tmux / cmux to inject keys.

## Roadmap

### Done ✅
- Host / web / native app wired end-to-end, all reusing one Host contract
- Global hooks with auto-slotting (session_id claim + cwd labels + LRU recycle)
- cmux / tmux key-injection adapters, with explicit-focus misfire prevention
- Bilingual i18n (web + app)
- Phase 2: voice dispatch, QR pairing, new-session / in-project fork injection (Host wiring complete)

### In progress / known gaps 🟡
- The app's synthesized key sound `_play` is a placeholder (synthesis done, playback wiring pending)
- The Codex app-server enhancement path has no real transport by default (caller must inject one)
- On-device acceptance of haptics / voice / QR (simulator verified; real device pending)

### Planned ⬜
- Bundle id + icon naming before App Store / Play submission
- More agent / event-source adapters

Full change log in [CHANGELOG.md](CHANGELOG.md).

## Related / Sibling Projects

- **Positioning** — the real Codex Micro's intelligence lives entirely in the ChatGPT desktop app; the hardware is just an HID keypad + RGB lights. So pure software (Host + web / app) is enough to reproduce the same interaction.
- **Open-source peers to look at** — amux, CloudCLI UI, agent-dashboard, Tactic Remote, etc.

## Citation

If you use OpenMicro in research or a project:

```bibtex
@software{openmicro,
  title  = {OpenMicro: A Software Remote for Local Coding Agents},
  year   = {2026},
  url    = {https://github.com/TonyWang-hub/openmicro}
}
```

## License

MIT — see [LICENSE](LICENSE). Contributions welcome ([CONTRIBUTING.md](CONTRIBUTING.md)); please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
