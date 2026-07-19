# OpenMicro

**An open-source software remote for your local coding agents** — watch 6 lights track every `claude` / `codex` session on your machine, and approve / reject / voice-dispatch straight back into the real session from your phone or browser. No leaning over the keyboard, no manually typing accept/reject.

> 手机/网页遥控本机 `claude` / `codex`：看灯 + 审批 + 语音派活——不用凑近电脑，也不用手动敲 accept/reject。

> **Inspired by, not affiliated with, the sold-out $230 "Codex Micro" agent macropad.** OpenMicro is an independent, open-source *software* reimagining of that interaction — it is **not** an OpenAI or Work Louder product and ships no hardware. "Codex" and "Codex Micro" are marks of their respective owners. The code keeps an internal `cms` prefix for historical reasons; it has no bearing on the public name.

## 一句话定位

真机 Codex Micro 只是一个 USB/蓝牙 HID 键盘 + RGB 灯，智能全在 ChatGPT 桌面 App 里；本项目用纯软件（Host 服务 + 网页/原生 App）复刻同样的体验：**6 盏灯实时反映你本机每个 agent 会话的状态，按键直接把 accept/reject/语音指令注入回那个真实会话**。

## 三端总览

```
┌─────────────┐   HTTP hooks 转发    ┌───────────────────┐   WS 广播状态    ┌──────────────┐
│ claude/codex │ ───────────────────▶│   Host（Node）      │─────────────────▶│  网页 / App   │
│ （真实会话） │◀─────────────────── │ ingest→store→router │◀─────────────────│ 看灯/按键/语音│
└─────────────┘   tmux/cmux 注入按键  └───────────────────┘   WS 发命令       └──────────────┘
```

| 端 | 目录 | 形态 | 定位 |
|---|---|---|---|
| **Host** | `host/` | Node.js 服务（HTTP + WebSocket） | 唯一真相源：收 hooks 事件、维护 6 槽状态机、把审批/语音指令注入回 tmux/cmux |
| **网页版** | `web/` | 两套页面：`web/index.html`（桌面开发面，左键盘+右真终端 xterm.js）、`web/toy/*` + `web/m.html`（手机 1:1 拟物玩具，竖屏，Demo/Live 双模式） | 免装 App，扫码/开链接即用 |
| **原生 App** | `app/`（Flutter） | 安卓/iOS 通用 | 网页版体感升级：真实触感（CoreHaptics/VibrationEffect）、合成机械键音、扫码配对、语音转文字派活；复用同一个 Host，Host 一行不改 |

详细架构、模块清单、关键设计决策见 **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**。

## 快速开始

### 1. 起 Host

```bash
npm install
npm start
```

或者一键脚本（检查 node/jq/curl、按需加载 `.env`、缺 `node_modules` 才装依赖、启动并打印配对提示）：

```bash
cp .env.example .env   # 可选，不改就用内置默认值
bash scripts/start.sh
```

浏览器打开 `http://127.0.0.1:7788`（桌面开发面，左键盘 + 右真终端）。Host 默认只监听 `127.0.0.1`；手机要连必须 `CMS_HOST=0.0.0.0` 重启（见 [docs/DEPLOY.md](docs/DEPLOY.md)）。

### 2. 装全局 hooks（自动跟踪所有 claude/codex 会话）

装一次，之后**任何目录**新开的 claude/codex 都自动占一盏灯、按项目名（cwd）标注、超 6 个 LRU 回收——不用再给每个项目手配 sessionKey。安装步骤（含 hook JSON 片段、卸载方法）见 **[docs/DEPLOY.md](docs/DEPLOY.md#全局-hooks-安装)**。

### 3. 手机开网页，或用 App 连接

```bash
# Demo 模式（零配置，6 个假 agent 演戏 + 音效震动）：
#   http://127.0.0.1:7788/m
# Live 模式（灯接你的真 agent，命令行注入）：
#   CMS_HOST=0.0.0.0 CMS_TOKEN=你的token npm start
#   电脑打开 http://<局域网IP>:7788/pair 出二维码 → 手机扫码进
```

原生 App（Flutter）：`cd app && flutter run`，进入后粘贴 `/pair` 页给出的配对链接，或直接扫码。构建/真机细节见 [docs/DEPLOY.md](docs/DEPLOY.md#app-构建)。

## Docker

容器版 Host 只适合"只看灯监控、不需要远程按键"的场景（比如放一台常驻小机器上做纯展示）。

```bash
cp .env.example .env   # 至少固定一个 CMS_TOKEN
docker compose up --build
```

局域网访问：`http://<宿主机IP>:7788/m?token=<CMS_TOKEN>&live=1`。

> ⚠️ **边界：容器版只能监控，不能远程按键注入。** accept/reject/语音派活靠 `tmux send-keys` 或 cmux CLI 把按键发回真实会话的终端，而那个 tmux 会话/cmux 进程本来就跑在**宿主机**上——容器里既没有宿主机的 tmux socket，也接触不到宿主机的 cmux 进程。灯效（hooks 事件点亮 6 槽状态机）在容器里完全正常，但点 accept/reject 或语音派活会得到"不在 tmux/cmux，无法远程按键"的提示。需要完整能力（按键注入 + 语音派活），请用上面「快速开始」里的 `scripts/start.sh` 直接在宿主机跑 Host。详见 [Dockerfile](Dockerfile) 顶部注释。

## 核心概念

- **自动认领槽（session_id 自动分配）**：Claude Code / Codex 的 hook 事件自带 `session_id`（会话唯一 UUID）和 `cwd`。Host 首次见到某个 `session_id` 就自动占用一个空槽（`slotId` 0–5）；6 槽占满后按 LRU 淘汰最久未活跃的空闲槽（`needs_input` 受保护，尽量不淘汰）。不再需要每个项目手动绑定 `sessionKey`。详见 `docs/specs/2026-07-18-auto-slot-assignment.md`。
- **cmux/tmux 注入**：灯效永远只由官方 hooks/notify 事件驱动（**绝不**从终端文本推断）；而"远程按键"（accept/reject/语音派活）需要把按键真的发回那个会话的终端——这要求该会话跑在 **tmux**（`tmux send-keys`）或 **cmux**（用户实际使用的 GUI 多路终端，`cmux send` / `send-key --surface`）里。两者都不在，就只能看灯，按键会提示"不在 tmux/cmux，无法远程按键"。两者都在时优先 cmux（真实 TUI 所在处）。
- **显式聚焦安全**：命令键（◎✓ accept / ⊗ reject / ⚡ quick / 🎙 语音）只作用于用户**显式点选**的那个 Agent 灯，绝不自动挑选——防止误注入到错误的会话或对话窗口。这条规则由网页/App 前端在发送指令前保证（点一盏灯才允许发命令），完整契约见 [docs/COMMANDS.md](docs/COMMANDS.md)。

## 能力矩阵

| 能力 | 前提条件 | 说明 |
|---|---|---|
| **监控（灯 + LCD 文案）** | 任何 claude/codex 会话，装了全局 hooks 即可 | session_id 自动认领槽、cwd 标注项目名，这是核心价值，与是否在 tmux/cmux 无关 |
| **手机/App 远程按 ◎✓/⊗（accept/reject）** | 该会话跑在 **tmux 或 cmux** 里 | 注入按键需要一个真实的 pane/surface 作为目标；非 tmux/cmux 会话只能看灯，按键无效（会提示，不报错） |
| **🎙 语音派活（把说的话打进终端）** | 同上（tmux/cmux）+ 浏览器/App 支持语音识别 | 网页走 Web Speech API（`webkitSpeechRecognition`，不支持的浏览器降级提示用键盘）；App 走 `speech_to_text` |
| **💭 新建会话 / ⤴ 项目内分叉** | Host 能调用 `tmux new-session` 或 `cmux workspace create` | 新会话自动经 hooks 上灯，无需手动绑定 |

WS 命令契约（各 action 的载荷/行为/失败路径）见 **[docs/COMMANDS.md](docs/COMMANDS.md)**。

## 状态

MVP 接线（tmux 会话生命周期 + 官方事件灯效，即 spec 里的 "B+C" 方案）已落地并自动化验证。玩具 Demo/Live 双模式、全局 hooks 自动分槽、cmux 注入 adapter、原生 Flutter App 均已实现。二期（语音派活 + 扫码配对 + 新会话/分叉的真实注入）已完成 Host 侧接线，详见 `docs/specs/2026-07-19-phase2.md`。

## 相关调研 / 同源项目

- 硬件调研：my-project `internal-research`（核验结论：真机智能全在 ChatGPT 桌面 App，因此纯软件可复刻；开源同类：amux / CloudCLI UI / agent-dashboard / Tactic Remote）
- 同源项目：my-project `notes/internal-project/`（`codex app-server` 事件流客户端可复用件，本项目的 codex app-server 可选增强路径正是从那里借鉴）

## 文档索引

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — 数据流、命令回程、模块清单、关键设计决策
- **[docs/DEPLOY.md](docs/DEPLOY.md)** — Host 部署 env、hooks 安装/卸载、网页访问、App 构建
- **[docs/COMMANDS.md](docs/COMMANDS.md)** — WS 命令契约表、ingest 事件格式、五色灯态映射
- `docs/specs/` — 各阶段设计 spec（原始决策记录，不做面向新读者的整理）
- `docs/design/` — 外观定稿的可交互 HTML 稿（`simulator-v6-mockup.html` 键盘本体、`layout-v2-hifi-mockup.html` 桌面布局）
