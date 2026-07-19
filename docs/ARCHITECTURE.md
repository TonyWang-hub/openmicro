# 架构

面向新读者的技术总览。项目定位、快速开始见根 [README.md](../README.md)；命令契约的逐字段细节见 [COMMANDS.md](./COMMANDS.md)；部署/环境变量见 [DEPLOY.md](./DEPLOY.md)。

## 1. 数据流：hook 事件 → 灯

```
claude/codex 真实会话
   │ 官方 hook（PreToolUse/Stop/Notification…），stdin 传 JSON（含 session_id、cwd、hook_event_name…）
   ▼
scripts/cms-hook-forward.sh          ← 全局装一次，四个 hook 事件都指向它
   │ 解析 stdin：session_id→sessionKey，cwd→label(basename)+完整路径
   │ $TMUX 非空 → tmuxTarget；$CMUX_PANEL_ID 非空 → cmuxTarget
   │ fire-and-forget POST（--max-time 3，永远 exit 0）
   ▼
POST /ingest/hook  { agent, channel, sessionKey, label, cwd, tmuxTarget, cmuxTarget, payload }
   │ host/ingest/http-ingest.js: parseIngestBody 校验
   ▼
store.resolveSession({ sessionKey, agent, label, cwd, tmuxTarget, cmuxTarget })
   │ host/state/agent-state-store.js
   │ 已见过该 sessionKey → 返回原槽（更新 lastEventAt/label/cwd/target）
   │ 未见过 + 有空槽 → 占最小空闲 slotId（0..5）
   │ 未见过 + 6 槽满 → LRU 淘汰（idle/complete/unknown 优先，needs_input 尽量保护）
   ▼
mapRaw(agent, channel, payload, binding)   ← host/adapters/{claude-code,codex}.js
   │ hookEventName / notificationType → LightState（idle/thinking/complete/needs_input/error）
   ▼
store.applyEvent(event)   ← sessionKey 校验（防串槽）、complete 态设 ≤2s 后自动回 idle 定时器
   │ onChange 回调
   ▼
hub.broadcast({ type:'state', slots: store.snapshot(), focusedSlotId })   ← host/ws/hub.js
   │ WS 广播给所有已连客户端
   ▼
web/toy/live.js（手机玩具） · web/app.js（桌面开发面） · app/lib/net/live_client.dart（原生 App）
   → 五色灯态渲染 + LCD 文案
```

关键约束（写死在代码和测试里，不是建议）：
- **灯效权威 = 事件，绝不读 pane 文本推断**（`host/state/no-pane-inference.test.js` 是这条规则的负面回归测试）。
- **事件的 `sessionKey` 必须匹配槽位当前绑定的 sessionKey**，不匹配直接丢弃（防止两个会话事件串槽）。
- Host down 时转发脚本必须对本机 claude/codex 零影响：`--noproxy '*' --max-time 3`，任何失败都吞掉、`exit 0`。

## 2. 命令回程：端 → 真实会话

```
网页/App（用户点 ◎✓ / ⊗ / ⚡ / 🎙 / 💭 / ⤴）
   │ 显式聚焦守卫：未先点选一盏 Agent 灯，命令键不发送（前端拦截，见 web/m.html onCmd）
   ▼
WS 发送 { type:'command', payload:{ action, slotId?, text? } }
   ▼
host/index.js ws.on('message') → router.handleCommand(payload)   ← host/command-router.js
   │
   ├─ action ∈ {accept, reject, quick}
   │    keys = action==='quick' ? ['Enter'] : keymap[slot.agent][action]
   │    优先级：slot.cmuxTarget（cmux.sendKeys）> slot.tmuxTarget（tmux.sendKeys）> 都无（LCD 提示，不报错）
   │
   ├─ action === 'prompt'（🎙 语音派活）
   │    text 非空 → cmux.sendText(text) 或 tmux.sendKeys([text, 'Enter'])；同样的目标优先级
   │
   ├─ action ∈ {new_session, branch}
   │    new_session：在 CMS_DEFAULT_CWD 新开会话（cmux.createSession 或 tmux.newSession），固定 claude-code
   │    branch：在 store.slotCwd(slotId)（选中会话的 cwd）新开同目录会话，agent 沿用选中槽的 agent
   │    新会话通过自己的 hooks 自动上灯，Host 不需要手动绑定
   │
   └─ action === 'focus'
        仅设置 Host 侧 focusedSlotId 并广播 state（不注入任何按键）
   │
   ▼
host/cmux/client.js（execFile cmux send / send-key --surface <UUID>）
或 host/tmux/client.js（spawn tmux send-keys -t <session>）
   │ 若报错含 not found/no such/unknown surface|pane|session（会话已关）
   ▼
store.dropSlot(slotId)   ← 把已消失的会话从灯位上摘掉，而不是持续报错
```

## 3. 模块清单

### `host/`（Node.js，Host 服务）

| 文件 | 职责 |
|---|---|
| `index.js` | 进程入口：HTTP+WS 服务器、静态文件（`web/` + `/vendor/*` 指向 `node_modules` 里的 xterm/qrcode-generator）、路由（`/api/health`、`/api/pair` 仅本机、`/ingest/hook`、`/m`、`/pair`）、pty 附着管理、启动横幅打印配对 URL |
| `config.js` | 从环境变量加载配置；内置默认 keymap（claude-code `accept:['1'] reject:['Escape']`，codex `accept:['y'] reject:['Escape']`），`CMS_KEYMAP` JSON 可逐 agent 覆盖（深合并） |
| `auth.js` | token 校验：来源 loopback 直接放行；否则按 `?token=` query → `x-cms-token` header → `cms_token` cookie 顺序取值，常数时间比较 |
| `command-router.js` | WS 命令分发：accept/reject/quick/prompt/new_session/branch/focus 的具体处理与失败兜底 |
| `state/agent-state-store.js` | 核心状态机：`bindSlot`（静态预绑，向后兼容）、`resolveSession`（动态认领+LRU，全局 hooks 的核心）、`applyEvent`（五态转移+sessionKey 校验）、`tick`（complete→idle 定时、ingest 心跳超时→unknown）、`dropSlot` |
| `ingest/http-ingest.js` | `POST /ingest/hook` 处理：校验 body → `resolveSession` 拿槽位 → 按 `agent`+`channel` 选适配器 `mapRaw` → `applyEvent` |
| `adapters/claude-code.js` | Claude Code hook 事件名/`Notification.notificationType` → `LightState` 映射表 |
| `adapters/codex.js` | Codex 三条事件源的映射：hooks（主路径）、legacy `notify`（仅 `agent-turn-complete`→complete，不覆盖 needs_input）、app-server 状态（`running/awaiting_approval/succeeded/failed/cancelled`） |
| `adapters/codex-app-server.js` | 可选增强 ingest 包装；`CMS_CODEX_APP_SERVER` 关闭时整个是 no-op。**注意**：默认 `createTransport` 未真正实现（见下文"已知差异"），需要调用方注入真实 transport |
| `adapters/normalize-hook.js` | 把官方 hook payload 的 camelCase/snake_case 字段名统一（`hookEventName`/`hook_event_name` 等） |
| `tmux/client.js` | tmux CLI 封装：`ensureTmux`/`sessionExists`/`newSession`/`sendKeys`/`killSession` |
| `tmux/pty-session.js`、`tmux/pty-map.js` | node-pty 附着到 tmux pane，供 `web/index.html` 桌面开发面的真终端（xterm.js）读写；与灯效链路完全独立（B+C 两条通道正交） |
| `cmux/client.js` | cmux CLI 封装：`classifyKey`（可打印字符走 `send`，命名键走 `send-key`，二者不可混用）、`sendKeys`、`sendText`（语音派活：整段文字 `send` 再 `send-key enter`）、`createSession`（`cmux workspace create`） |
| `ws/hub.js` | 极简 WS 客户端集合 + 广播/单发 |
| `types.js` | 共享类型注释与常量：`LIGHT_STATES`、`MAX_SLOTS=6`、`COMPLETE_HOLD_MS=2000`、`INGEST_STALE_MS=30000` |

### `web/`（两套前端，注意不是同一套 UI）

| 文件 | 职责 |
|---|---|
| `index.html` / `app.js` / `keyboard.js` / `terminal.js` / `styles.css` | **桌面开发面**：v6 键盘视觉 + 右侧 xterm.js 真终端 tabs，走 `term_input`/`term_output`/`term_resize` 消息，用于本机开发调试，不是手机玩具的代码 |
| `pair.html` | 配对二维码页（仅本机可访问 `/api/pair`），把 `mobileUrl` 编码成二维码；`?live=1` 时编码 Live 模式链接 |
| `toy/m.html` 的宿主页 `web/m.html` | **手机拟物玩具**页面壳：读 `?token=`+`?live=1` 决定 Demo/Live；接线 `toy/keyboard.js`+`toy/audio.js`+`toy/haptics.js`+`toy/demo-script.js`（Demo）或 `toy/live.js`（Live）；实现显式聚焦、PTT 语音识别（Web Speech API） |
| `toy/keyboard.js` | 渲染 1:1 复刻键盘 DOM（整键发光五态、LCD 文案、聚焦环、mic 禁用态），只发回调，不碰业务逻辑 |
| `toy/audio.js` | 全部 WebAudio 合成的机械键声（pom 清脆 / pok 静音两档），无外部音频文件 |
| `toy/haptics.js` | `navigator.vibrate` 薄封装，不支持时静默 no-op |
| `toy/demo-script.js` | 纯逻辑 Demo 剧本引擎（不碰 DOM）：6 槽独立"生活线"、needs_input 等待/超时、PTT 打断 |
| `toy/live.js` | Live 模式 WS 封装：`connectLive({token,onState,onLcd,onConnection}) → {sendCommand(action,slotId,text?)}`，指数退避重连（上限 30s） |

### `app/`（Flutter，安卓/iOS 原生 App）

| 文件 | 职责 |
|---|---|
| `lib/main.dart` | App 壳：`ConnectScreen`（粘贴配对链接/token，或跳转扫码；支持 `--dart-define=PAIR_URL=` 开发快捷自动连接）、`KeyboardScreen`（把 `DeviceKeyboard` 接到 `LiveClient`/触感/键音/语音识别，显式聚焦守卫与 web 版一致） |
| `lib/net/live_client.dart` | WS 客户端，协议与 `web/toy/live.js` 一致（`state`/`log` 接收，`command`/`prompt` 发送），指数退避重连（1s 起步，上限 30s） |
| `lib/model/slot.dart` | 领域模型：`SlotState`/`AgentState`/`SlotCommand`，镜像 Host snapshot 字段（`canInject` 由 `cmuxTarget`/`tmuxTarget` 是否非空推出） |
| `lib/keyboard/device.dart` | 自绘拟物键盘 widget（`CustomPaint`/组合），移植自 web v6 视觉设计，含按压行程/发光/聚焦环 |
| `lib/haptics/haptics.dart` | Platform channel `com.microtoy/haptics` → iOS CoreHaptics / Android `VibrationEffect`；任何一层失败都静默降级到 Flutter `HapticFeedback`，最终静默 no-op（触感永不应该让业务代码抛异常） |
| `lib/audio/keysound.dart` | 运行时合成 16-bit PCM/WAV 字节（pom/pok 两档键声）；**播放half目前是占位符，未真正接驱动**（见下文"已知差异" #1） |
| `lib/pair/scan_page.dart` | `mobile_scanner` 扫码页，只负责扫描返回原始字符串，解析交给调用方 `parseTarget` |

## 4. 关键设计决策

1. **B+C 接线：tmux 管生命周期/终端 I/O，官方 hooks/notify/app-server 事件唯一决定灯色**（`docs/specs/2026-07-17-wiring-b-plus-c.md`）。两条通道职责正交、互不越界：tmux 通道绝不推断灯色，事件通道绝不替代终端 I/O。这是为了避免"灯从屏幕文字猜"这种脆弱且容易误判的方案。
2. **hook 转发脚本 fire-and-forget，且前台执行而非后台**（`scripts/cms-hook-forward.sh`）：`curl --max-time 3` 前台跑、任何失败吞掉、永远 `exit 0`。曾尝试过"`&` + `disown` 后台化"，但在 hook 执行上下文里探测到脚本退出时后台 curl 会被提前回收、事件根本发不出去，因此改回前台——由于 Host 恒为本机 loopback（~5ms 往返）且有超时上限，前台等待不会有感知延迟。
3. **显式聚焦防误注入**：accept/reject/quick/prompt/branch 一律只作用于用户点选的那个槽；这个守卫目前实现在**前端**（`web/m.html`、`app/lib/main.dart` 在发送前检查本地 `focusedSlot`），Host 侧的 `handleFocus` 只是记录并广播 `focusedSlotId`，并不会拿它去校验后续 `handleCommand` 请求的 `slotId` 是否与当前聚焦一致——也就是说安全边界目前是"UI 约定"而非"服务端强制"，这是有意的 MVP 取舍（同一 spec 里写明"UI 守卫，同一期"），但意味着一个绕过前端直接发 WS 消息的客户端可以指定任意 `slotId`。
4. **死槽自动清理**：两处协同——`resolveSession` 在 6 槽占满时按 LRU 淘汰空闲槽（`needs_input` 受保护）；`command-router.js` 在 cmux/tmux 注入报错匹配 `not found`/`no such`/`unknown surface|pane|session` 时直接 `store.dropSlot`，把已经关闭终端的会话从灯位上摘掉，避免它占着槽位持续报错。
5. **cmux 优先于 tmux**：一个会话如果同时上报了 `cmuxTarget` 和 `tmuxTarget`（嵌套场景，罕见），一律优先走 cmux——因为用户真实的 TUI 交互发生在 cmux surface 里。
6. **注入目标只信任会话自己上报的 surface/pane，绝不接受外部指定**：`tmuxTarget`/`cmuxTarget` 完全来自该 session 自己的转发脚本上报（`$TMUX`/`$CMUX_PANEL_ID`），Host 不会把任意调用方传入的字符串当成注入目标，杜绝命令误发到别的窗口。

## 5. 已知差异（代码 vs. 文档/spec 描述，供后续修复参考）

1. **App 键音播放尚未真正接通**：`app/lib/audio/keysound.dart` 已实现完整的 PCM/WAV 合成逻辑（`_synthesize`/`_synthChirp`/`_encodeWav`），但负责"播放"的 `_play` 目前是一个**空实现占位符**——即使 `pubspec.yaml` 已声明 `audioplayers` 依赖，声音合成出来后并没有真正调用播放 API。原生 App spec 的里程碑 M3（"体感 + 音效"）据此尚未完全达成。
2. **Codex app-server 增强路径没有真实 transport**：`host/adapters/codex-app-server.js` 的默认 `createTransport`（`defaultCreateTransport`）会直接 `throw new Error('no app-server transport configured')`；也就是说即便设置 `CMS_CODEX_APP_SERVER=1`，`main()` 里调用 `createCodexAppServerIngest` 时并未传入真实的 `createTransport` 实现，实际效果只是打一条 `connect failed` 的 warn 日志，功能不生效（除非调用方/测试显式注入 transport）。
3. **`scripts/install-hooks.md` 的 Claude Code 示例仍是旧的"静态绑定"写法**：文档表格把 `CMS_SESSION_KEY` 标为"必填"，命令片段里写死 `CMS_SESSION_KEY=cms-claude-0`；但 2026-07-18 上线的全局自动分槽设计（`docs/specs/2026-07-18-auto-slot-assignment.md`）里 `CMS_SESSION_KEY` 只是**当 stdin 没有 `session_id` 时的兜底**（Claude Code 官方 hook stdin 总是带 `session_id`，因此正常情况下用不到它）。`scripts/install-hooks.md` 本身不在本次文档任务的可改范围内，这里仅记录该文档尚未随新设计更新。
