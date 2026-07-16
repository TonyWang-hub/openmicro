# codex-micro-sim

Codex Micro（OpenAI × Work Louder $230 限量实体宏键盘）的软件模拟器：屏幕上的虚拟控制台，用于监控和控制本机 coding agent。

## 定位

- **用途**：真接本机 agent 日常用（非玩具）——键盘可控制 accept/reject/语音派活，6 个 Agent 键灯效实时反映 agent 会话状态
- **依据**：硬件调研核验结论——真机只是 USB/蓝牙 HID 键盘 + RGB 灯，智能全在 ChatGPT 桌面 App（JSON-RPC 桥）；因此纯软件可完整复刻功能。调研笔记见 my-project `internal-research`
- **外观**：已定稿 v6（正方形 4×4、白键帽+果冻底座、官方五态色板 idle 白/thinking 蓝/complete 绿/needs input 黄/error 粉、整键发光、图例丝印机身顶部、OLED 日志屏嵌机身底部），交互稿见 [docs/design/simulator-v6-mockup.html](docs/design/simulator-v6-mockup.html)（浏览器直开，注意该稿依赖外层 frame 的 toggleSelect，仅底部选项按钮不可用，键盘本体交互完整）

## 硬件对照（1:1 复刻目标）

| 真机部件 | 模拟器对应 |
|---|---|
| 6 半透明 Agent 键（RGB 五态） | 虚拟键 + 整键发光动画，绑定真实 agent 会话状态 |
| ⚡ / ✓ / ✕ / ⤴ 命令键 | quick action / accept / reject / branch |
| 🎙 加宽麦克风条 | push-to-talk 语音派活（按住录音） |
| 💭 键 | 新建会话线程 |
| 旋钮 | reasoning effort 调档（LOW/MED/HIGH/XHIGH） |
| 摇杆 | 切会话 / 滚日志 |
| 触摸传感器 | 唤醒/锁定面板 |

## 设计稿（docs/design/，浏览器直开；底部选项按钮依赖外层 frame 不可用，其余交互完整）

| 文件 | 内容 | 状态 |
|---|---|---|
| `simulator-v6-mockup.html` | 键盘本体外观定稿（v1-v6 迭代：深色赛博→照真机重做→3D→轻立体→整键发光+图例/日志屏入机身） | ✅ 定稿 |
| `layout-v2-hifi-mockup.html` | 桌面应用布局高保真：左 v6 键盘 + 右终端面板（tab 圆点=Agent 键灯色联动、审批卡、状态栏） | 待用户确认 |

## 已拍板的决策

1. **用途**：真接 agent 日常用（非玩具/演示）
2. **目标 agent**：Claude Code + Codex 双支持一步到位（适配器抽象层）
3. **形态**：Web 为主 + 桌面轻壳（置顶/全局键）；手机 = 同一 Web 页自适应（PWA，键盘在上/终端抽屉在下）
4. **桌面布局**：左虚拟键盘 + 右真终端（xterm.js，开源），每 agent 会话一个 tab
5. **外观**：v6 定稿

## 玩具双模式（2026-07-17 定位拍板：手机 1:1 拟物玩具，Spec `docs/specs/2026-07-17-toy-demo-live-design.md`）

```bash
# Demo 模式（零配置，6 个假 agent 演戏 + 音效震动）：手机/浏览器开
#   http://127.0.0.1:7788/m
# Live 模式（灯接你的真 agent）：
#   CMS_HOST=0.0.0.0 CMS_TOKEN=你的token npm start
#   电脑开 http://127.0.0.1:7788/pair 出二维码 → 手机扫码进
```

- 音色切换：**长按键盘上的黑色触摸圆钮**（POM 清脆轴 / POK 静音轴），localStorage 记忆
- Live 审批注入默认：claude-code `['1']` / codex `['y','Enter']`，`CMS_KEYMAP` JSON 可覆盖——**⚠️ 未经真机校准，首次使用需对着真实权限对话实测**
- ⚠️ 对外发布前必须改名（Tactic Remote 被要求改名的前科；"Codex Micro" 是对方产品名）

## 状态

MVP 接线（B+C：tmux + 官方事件灯效）已落地（Spec：`docs/specs/2026-07-17-wiring-b-plus-c.md`）。玩具 Demo/Live 双模式已实现并自动化验证（93 tests + 端到端：注入 Notification → 手机键盘黄灯亮 → 按 ✓ → 键序注入真实 tmux）。待真机验收：音效/震动手感、Live keymap 校准。

## 相关

- 知识库调研：my-project `internal-research`（开源同类：amux / CloudCLI UI / agent-dashboard / Tactic Remote）
- 同源项目：my-project `notes/internal-project/`（mvp/bridge 已实现 codex app-server 事件流 + codex exec 兜底，本项目候选复用件）

## 启动

```bash
npm install
npm start
```

浏览器打开 [http://127.0.0.1:7788](http://127.0.0.1:7788)。

- **默认只监听本机 loopback**（`127.0.0.1`），局域网不可达——MVP 用 loopback 代替完整鉴权。
- 端口：`CMS_PORT`（默认 `7788`）
- 绑定地址：`CMS_HOST`（默认 `127.0.0.1`；若需对外监听可设 `0.0.0.0`，自行承担暴露风险）

## 装 hooks

灯效依赖 Claude Code / Codex 官方 hooks 转发事件到 Host。**不会自动改你的配置**，请按 [scripts/install-hooks.md](scripts/install-hooks.md) 手动安装并信任 hook 命令。

## MVP 验收（Spec §6.2）

1. 双 agent 同时在线，右侧终端可读可输入
2. 杀 Host 再起，原 tmux session 可 reattach，对话不丢
3. ✓ / ✕ / 新建 对当前槽生效（键序以 `config.keymap` 为准）
4. 人为断开 hooks 后，灯**不**随 pane 文本变色（负面回归；自动化见 `host/state/no-pane-inference.test.js`）
5. Claude Code：可见路径 `thinking` / `needs_input` / `complete`→`idle`
6. Codex hooks：同上；legacy notify 至少验证 `complete`；打开 app-server 后 `awaiting_approval`→黄灯
7. 双槽不串：错 `sessionKey` 的事件被丢弃
