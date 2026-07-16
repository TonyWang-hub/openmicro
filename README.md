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

## 状态

设计阶段（brainstorming 进行中）。技术方案、agent 接线方式（Codex CLI / Claude Code）、进程形态等待 spec 定稿后落 `docs/specs/`。

## 相关

- 知识库调研：my-project `internal-research`（开源同类：amux / CloudCLI UI / agent-dashboard / Tactic Remote）
- 同源项目：my-project `notes/internal-project/`（mvp/bridge 已实现 codex app-server 事件流 + codex exec 兜底，本项目候选复用件）
