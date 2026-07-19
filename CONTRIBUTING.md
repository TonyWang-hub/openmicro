# Contributing to OpenMicro

Thanks for your interest in contributing! This project has three components — a Node.js **Host**, a static **web** client, and a Flutter **app** — and each has its own local setup and test command.

感谢关注本项目！项目分三端：Node.js **Host**、静态**网页** 客户端、Flutter **App**，各端有各自的本地环境与测试命令，见下文。

## Getting started locally / 本地起步

Clone the repo and set up the component(s) you plan to work on:

```bash
git clone <repo-url>
cd openmicro
```

### Host (`host/`)

Requires Node.js `>=22` (see `package.json` `engines`).

```bash
npm install
npm test
```

`npm install` triggers a `postinstall` script (`scripts/fix-node-pty-perms.js`) that restores an executable bit `node-pty` sometimes loses when packaged — this is expected and safe.

To run the Host locally: `npm start` (or `npm run dev` for auto-restart on change). See [docs/DEPLOY.md](docs/DEPLOY.md) for environment variables.

### Web (`web/`)

```bash
cd web
node --test "test/**/*.test.js"
```

No build step or bundler — `web/` is served as-is by the Host. Open `http://127.0.0.1:7788/` (desktop dev pane) or `/m` (mobile toy) after starting the Host.

### App (`app/`, Flutter)

Requires the Flutter SDK (Dart `^3.7.2`, see `app/pubspec.yaml`).

```bash
cd app
flutter pub get
flutter test
flutter analyze
```

Both `flutter test` and `flutter analyze` must pass clean before submitting a PR. See [docs/DEPLOY.md](docs/DEPLOY.md#app-构建) for real-device build/run notes (iOS signing, mic/camera permissions, simulator limitations).

## Code style / 代码风格

- **Host / web**: plain modern JavaScript (ES modules, Node `--test` for unit tests). No linter is currently enforced — match the style of the surrounding file (naming, module boundaries, comment density). Keep hook/ingest/router modules side-effect-free and unit-testable, per the existing `*.test.js` pattern.
- **App**: standard Dart/Flutter style, enforced by `flutter analyze` against `app/analysis_options.yaml` (`package:flutter_lints/flutter.yaml`). Do not disable lint rules inline unless justified in the PR description.
- Keep documentation in sync: architecture-affecting changes should update `docs/ARCHITECTURE.md`, `docs/DEPLOY.md`, or `docs/COMMANDS.md` as appropriate, not just code comments.

代码风格：Host/web 走原生 ES module + Node 内置 `--test`，暂无强制 linter，跟随所在文件既有风格；App 走 `flutter analyze` 强制检查，不要为了绕过 lint 而行内禁用规则。改动影响架构/部署/命令契约时同步更新对应 docs。

## Commit conventions / 提交规范

- Prefer [Conventional Commits](https://www.conventionalcommits.org/)-style prefixes where practical: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`. Existing history uses this pattern, e.g. `feat(pwa): ...`, `test: ...`.
- Keep commits scoped to one logical change; avoid mixing unrelated fixes with new features.
- Write commit messages that explain *why*, not just *what*, when the change isn't self-evident from the diff.

提交信息优先用 Conventional Commits 风格前缀（`feat:`/`fix:`/`docs:`/`test:`/`chore:`/`refactor:`），单次提交聚焦一个逻辑改动。

## Pull request process / PR 流程

1. Fork the repo and create a feature branch off `main`.
2. Make your change, keeping it scoped to a single concern (surgical, not "while I'm here" refactors bundled in).
3. Run the relevant test command(s) above for every component you touched, and confirm they pass.
4. Update relevant docs (`README.md`, `docs/*.md`) if behavior, env vars, or the WS command contract changed.
5. Open a PR using the repository's [pull request template](.github/PULL_REQUEST_TEMPLATE.md), describing what changed and why, and how you tested it.
6. Be responsive to review feedback — small, iterative PRs are easier to review than large ones.

Before opening a PR against a renamed/public fork, double-check the project name doesn't reference "Codex Micro" in a way that implies affiliation with the OpenAI × Work Louder hardware product (see the warning at the top of [README.md](README.md)).

PR 前请确认：改动范围单一、相关端测试跑过、涉及行为/环境变量/WS 命令契约变更的文档已同步更新；对外发布分支需确认项目名不再暗示与官方 Codex Micro 硬件的关联。

## Reporting bugs / requesting features

Please use the issue templates: [bug report](.github/ISSUE_TEMPLATE/bug_report.md) or [feature request](.github/ISSUE_TEMPLATE/feature_request.md).

## Security issues

Do **not** open a public issue for security vulnerabilities — see [SECURITY.md](SECURITY.md) for the reporting process.
