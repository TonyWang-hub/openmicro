# 命令与事件契约

Host 的 WS/HTTP 接口定义。整体数据流见 [ARCHITECTURE.md](./ARCHITECTURE.md)；部署与环境变量见 [DEPLOY.md](./DEPLOY.md)。

## 1. WebSocket 连接

```
ws://<host>:<port>/?token=<token>
```

鉴权规则同 HTTP：来自 loopback 的连接直接放行；否则 `?token=` query 必须与 `CMS_TOKEN` 常数时间比较一致，鉴权失败在 `server.on('upgrade')` 阶段直接 `socket.destroy()`（不会升级成 WS）。

### 1.1 Client → Host 消息

| `type` | 载荷 | 说明 |
|---|---|---|
| `subscribe` | 无 | 请求立即回一份当前 `state` 快照；同时触发 Host 侧把因"等首个订阅者再重绘"而延迟的 tmux pty 附着（`flushPendingAttaches`）执行掉 |
| `command` | `{ payload: CommandRequest }` | 见下方 §2 命令动作表 |
| `term_input` | `{ slotId, data }` | **仅桌面开发面**（`web/index.html`+xterm.js）：把按键原样写入该槽对应 pty；槽不存在时回一条 `error` |
| `term_resize` | `{ slotId, cols, rows }` | **仅桌面开发面**：调整该槽 pty 的终端尺寸；`cols`/`rows` 必须为正数，否则静默忽略 |

未知 `type` 会收到 `{ type:'error', message:'unknown message type: <type>' }`。

### 1.2 Host → Client 消息

| `type` | 载荷 | 时机 |
|---|---|---|
| `ready` | `{ tmux: boolean, ingestHint: 'POST /ingest/hook' }` | 每个新连接建立时立即发一次 |
| `state` | `{ slots: SlotSnapshot[], focusedSlotId: number \| null }` | 连接建立时、`subscribe` 时、任何槽状态变化时（`store.onChange`）、`focus` 命令处理后广播给**所有**已连客户端 |
| `log` | `{ level: 'info'\|'warn'\|'error', message: string }` | 命令执行结果的人类可读提示（如"◎✓ 接受 → cmux xxx"、"该会话不在 tmux/cmux，无法远程按键"），也用作手机 LCD 显示文案 |
| `error` | `{ message: string }` | 消息解析失败 / 命令处理抛异常 |
| `term_output` | `{ slotId, data }` | **仅桌面开发面**：该槽 pty 的原始输出，喂给 xterm.js |

`SlotSnapshot` 字段（`store.snapshot()`）：

```ts
{
  slotId: number,        // 0..5
  agent: 'claude-code' | 'codex',
  sessionKey: string,    // 通常是 hook 上报的 session_id UUID
  state: LightState,     // 见 §3
  meta: 'unbound' | 'bound' | 'detached',
  lastEventAt: number,   // epoch ms
  label: string | null,  // cwd basename，项目名标注
  cwd: string | null,    // 完整路径，branch 用它决定新会话的工作目录
  tmuxTarget: string | null,  // 该会话上报的 tmux session 名；null=不可注入
  cmuxTarget: string | null,  // 该会话上报的 cmux surface UUID；null=不可注入
}
```

## 2. 命令动作表（`{ type:'command', payload:{ action, slotId?, text? } }`）

| `action` | 载荷 | 需要 `slotId` | Host 行为 |
|---|---|---|---|
| `accept` | `{ slotId }` | 是 | 查 `keymap[slot.agent].accept`（默认 claude-code `['1']`、codex `['y']`），按 `cmuxTarget`（cmux）> `tmuxTarget`（tmux）> 都无（仅记 log，不报错）的优先级注入 |
| `reject` | `{ slotId }` | 是 | 同上，用 `keymap[slot.agent].reject`（默认均为 `['Escape']`） |
| `quick` | `{ slotId }` | 是 | 注入固定 `['Enter']`——不查 per-agent keymap，语义是"按 Enter 继续"这类通用推进操作 |
| `prompt` | `{ slotId, text }` | 是 | 语音/文字派活：`text` 去空白后为空则只记 log 不注入；非空时 cmux 走 `sendText`（先整段 `send` 文本，再 `send-key enter` 提交），tmux 走 `sendKeys([text, 'Enter'])` |
| `new_session` | `{}`（**无** `slotId`） | 否 | 在 `CMS_DEFAULT_CWD` 新开一个会话（cmux 用 `workspace create`，tmux 用 `new-session`），固定命令为 `commands['claude-code']`（即 `CMS_CMD_CLAUDE`，默认 `claude`）；新会话经自己的 hooks 自动上灯 |
| `branch` | `{ slotId }` | 是 | 在**选中槽的 `cwd`**（`store.slotCwd(slotId)`，取不到则回退 `CMS_DEFAULT_CWD`）新开一个同 agent 会话——"从这个项目分叉一条新线" |
| `focus` | `{ slotId }` | 是 | 设置 Host 侧 `focusedSlotId` 并广播一次 `state`；不注入任何按键。**注意**：这只是记录/广播，Host 并不会拿它去校验后续 `accept`/`reject`/`prompt` 请求的 `slotId` 是否等于当前 `focusedSlotId`——"命令只作用于显式聚焦的槽"这条安全规则是**客户端**（`web/m.html`、`app/lib/main.dart`）在发送前自行拦截的约定，不是服务端强制 |

共同失败路径：
- `slotId` 未绑定（`store.snapshot()` 里查不到）→ `{type:'error'}` + `{type:'log', level:'error'}`，不崩溃。
- `accept`/`reject`/`quick`/`prompt` 若 `keymap` 里查不到对应条目 → 同上报错。
- cmux/tmux 注入失败且报错信息匹配 `/not.?found|no such|unknown (?:surface|pane|session)/i`（说明目标 pane/surface 已经不存在，即会话终端已关闭）→ `store.dropSlot(slotId)` 把该槽直接摘除并提示"已从灯位移除"，而不是持续报底层错误。
- `new_session`/`branch` 找不到对应 agent 的启动命令，或 spawn 调用本身失败 → `{type:'error'}` + log，不影响其他槽。

## 3. Ingest 事件格式（`POST /ingest/hook`）

由 `scripts/cms-hook-forward.sh`（或任何符合同样契约的转发器）调用；不是给终端用户直接手敲的接口，但可用于手动探测。

### 请求体

```ts
{
  agent: 'claude-code' | 'codex',
  channel: 'hooks' | 'notify-legacy' | 'app-server',
  sessionKey: string,           // 必填；Claude Code 官方 hook stdin 的 session_id
  label?: string | null,        // cwd basename，项目名标注
  cwd?: string | null,          // 完整路径
  tmuxTarget?: string | null,   // 当前 tmux session 名（脚本从 `tmux display-message -p '#S'` 取）
  cmuxTarget?: string | null,   // 当前 cmux surface UUID（脚本从 `$CMUX_PANEL_ID` 取）
  payload: Record<string, unknown>,  // 官方 hook 原始 JSON（含 hook_event_name/notification_type，camelCase/snake_case 均可）
}
```

`agent`/`channel` 值不在允许集合内、`sessionKey` 缺失或为空、`payload` 不是对象 → `400 { ok:false, error }`。合法但适配器映射不出灯态（比如某个 hook 事件不在映射表里）→ 仍然 `200 { ok:true }`，只是不产生状态变化（这也是为什么"缺 hooks 时终端可用但灯不亮"而不是报错）。

### 处理顺序

1. `store.resolveSession({ sessionKey, agent, label, cwd, tmuxTarget, cmuxTarget })` —— **任何**合法请求都会认领/刷新一个槽位，没有"未知 sessionKey 拒绝"这一说，这正是全局自动分槽的核心行为。
2. 按 `agent` + `channel` 选适配器：
   - `channel:'hooks'` + `agent:'claude-code'` → `mapClaudeHook`
   - `channel:'hooks'` + `agent:'codex'` → `mapCodexHook`
   - `channel:'notify-legacy'` + `agent:'codex'` → `mapCodexLegacyNotify`（仅认 `payload.type === 'agent-turn-complete'`）
   - `channel:'app-server'` + `agent:'codex'`（且 `CMS_CODEX_APP_SERVER=1`）→ `mapCodexAppServerStatus`
   - 其余组合（如 `notify-legacy`+`claude-code`）→ 不产生事件
3. 映射出的 `AgentLightEvent` 交给 `store.applyEvent`：`sessionKey` 必须匹配该槽当前记录的 `sessionKey`，不匹配则 `{ok:false, reason:'sessionKey mismatch'}`（防止两个会话事件串槽——理论上因为 `resolveSession` 刚认领/刷新过槽位，这条分支正常不会触发，是纵深防御）。

### 事件到灯态的映射表

**Claude Code**（`host/adapters/claude-code.js`）：

| hook 事件 | → state |
|---|---|
| `SessionStart` / `SessionEnd` | `idle` |
| `UserPromptSubmit` / `PreToolUse` | `thinking` |
| `Stop` | `complete`（`CMS_COMPLETE_HOLD_MS` 后自动回 `idle`） |
| `StopFailure` | `error` |
| `Notification`，`notificationType==='agent_completed'` | `complete` |
| `Notification`，其余任何值（含缺失） | `needs_input`（宁可误报也不能漏报——黄灯不亮是这个设备最差的失败模式） |

**Codex**（`host/adapters/codex.js`）：

| 源 | 事件/字段 | → state |
|---|---|---|
| hooks（主路径） | `SessionStart`/`SessionEnd` | `idle` |
| hooks | `UserPromptSubmit`/`PreToolUse` | `thinking` |
| hooks | `PermissionRequest` | `needs_input` |
| hooks | `Stop` | `complete` |
| hooks | `StopFailure` | `error` |
| hooks | `Notification`，`notificationType` ∈ `permission_prompt`/`agent_needs_input`/`elicitation_*` | `needs_input` |
| hooks | `Notification`，`notificationType==='agent_completed'` | `complete` |
| legacy notify（弃用兼容） | `payload.type==='agent-turn-complete'` | `complete`（**不会**覆盖已有的 `needs_input`，因为它是唯一映射，其余 type 一律不产生事件） |
| app-server（默认关，且当前无真实 transport 实现，见 [ARCHITECTURE.md §5](./ARCHITECTURE.md#5-已知差异代码-vs-文档spec-描述供后续修复参考)） | `state==='running'` | `thinking` |
| app-server | `state==='awaiting_approval'` | `needs_input` |
| app-server | `state==='succeeded'` | `complete` |
| app-server | `state==='failed'` / `'cancelled'` | `error` |

## 4. 灯态五色映射

```
idle 白 #fff → thinking 蓝 #7c9bf5 → complete 绿 #7ed9a2（≤2s 后回 idle）
                    ↓
              needs_input 黄 #ffc456（等待用户，超时不惩罚也不自动清除——只有真实事件能移走它）
                    ↓
                error 粉 #f78bb6
```

（配色取自 `web/toy/keyboard.js` 键盘图例，legend 与真机官方五态色板一致：idle 白/thinking 蓝/complete 绿/needs input 黄/error 粉。）

第六态 `unknown`（灰/熄，`host/types.js` `LIGHT_STATES` 里存在）**不是**一个正常展示态，而是"槽已绑定但事件流断了"的降级标记：
- `resolveSession` 认领新槽时初始 `state:'unknown'`，直到第一条真实事件落地。
- `tick()` 心跳：非 `idle`/`unknown`/`needs_input` 的槽如果 `now - lastEventAt >= CMS_INGEST_STALE_MS`（默认 30s）没收到新事件 → 判定 `unknown`，`meta` 转 `detached`（会话可能还在，只是 hooks 断了）。
- `needs_input` **豁免**这条心跳超时规则——agent 等审批可能长达数分钟不产生新事件，黄灯必须一直亮到用户或下一轮真实事件把它移走。
- 玩具前端约定**默认视觉态永远是 `idle` 白**，绝不用灰色 `unknown` 做默认展示（`web/toy/keyboard.css` 注释明确写了"unknown/灰色做默认视觉是被禁止的"）。
