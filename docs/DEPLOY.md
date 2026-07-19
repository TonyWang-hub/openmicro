# 部署

如何把 Host 跑起来、装上全局 hooks、让手机/App 连上。项目定位见根 [README.md](../README.md)；数据流与模块见 [ARCHITECTURE.md](./ARCHITECTURE.md)；WS 命令细节见 [COMMANDS.md](./COMMANDS.md)。

## Host 部署

### 安装与启动

```bash
npm install     # 会触发 postinstall: scripts/fix-node-pty-perms.js（修复 node-pty 打包丢失的可执行位）
npm start       # 等价于 node host/index.js
# 开发时用 npm run dev（node --watch，改代码自动重启）
```

Node 版本要求 `>=22`（见 `package.json` `engines`）。

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CMS_HOST` | `127.0.0.1` | 绑定地址。**只监听本机 loopback 是默认安全姿态**——局域网/手机连不上时先检查是不是忘了这个。设为 `0.0.0.0` 对外监听，风险自担（无完整鉴权体系，仅靠 token） |
| `CMS_PORT` | `7788` | HTTP+WS 监听端口 |
| `CMS_TOKEN` | 未设时启动随机生成（8 字节 hex） | Live 模式配对 token，来自非 loopback 的请求必须带它（query `?token=`、header `x-cms-token`，或页面加载后种下的 `cms_token` cookie） |
| `CMS_COMPLETE_HOLD_MS` | `2000` | `complete`（绿灯）态展示多久后自动回 `idle` |
| `CMS_INGEST_STALE_MS` | `30000` | 非 idle/unknown/needs_input 态超过这么久没收到新事件 → 判定为 `unknown`（ingest 断流心跳） |
| `CMS_CODEX_APP_SERVER` | 关闭 | 设为 `1` 开启 codex app-server 可选增强 ingest（⚠️ 当前默认 transport 未真正实现，见 [ARCHITECTURE.md §5](./ARCHITECTURE.md#5-已知差异代码-vs-文档spec-描述供后续修复参考) 第 2 条） |
| `CMS_DEFAULT_CWD` | `process.cwd()`（Host 启动时所在目录） | `new_session` 命令新开会话时使用的默认工作目录 |
| `CMS_DATA_DIR` | `~/.cms` | 预留数据目录（当前实现未见落盘使用，按需扩展） |
| `CMS_KEYMAP` | 内置默认 | JSON 字符串，深合并覆盖每 agent 的 `accept`/`reject` 键序，例：`CMS_KEYMAP='{"codex":{"accept":["y","Enter"]}}'` |
| `CMS_CMD_CLAUDE` | `claude` | `new_session`/`branch` 对 claude-code 槽实际执行的启动命令 |
| `CMS_CMD_CODEX` | `codex` | 同上，codex 槽 |
| `CMS_CMUX_BIN` | `cmux` | cmux CLI 路径；未显式配置时优先找 `PATH` 里的 `cmux`，找不到再退回 macOS 应用包内路径 `/Applications/cmux.app/Contents/Resources/bin/cmux` |

默认 keymap（`host/config.js`，2026-07-17 已对真实 TUI 实测校准）：

```js
{
  'claude-code': { accept: ['1'], reject: ['Escape'] }, // 权限对话按 1 接受、Esc 取消
  codex:         { accept: ['y'], reject: ['Escape'] }, // y 热键立即确认（无需 Enter）、Esc 拒绝
}
```

### 局域网访问 checklist

1. `CMS_HOST=0.0.0.0` 启动（否则手机连的是"局域网 IP:端口"但服务根本没监听那块网卡）。
2. 建议同时固定 `CMS_TOKEN`（不固定则每次重启 token 变，旧的配对链接失效）。
3. 电脑打开 `http://127.0.0.1:7788/pair` 看二维码（`/pair` 与 `/api/pair` 都限制只有 loopback 请求能访问，不会把配对页暴露到局域网）。
4. 手机与电脑同一局域网，扫码或手输 `http://<局域网IP>:7788/m?token=<token>&live=1` 进 Live 模式（不带 `live=1` 默认进 Demo 模式，纯前端假数据，不接 Host 状态）。

## 全局 hooks 安装

目标：装一次，之后任何目录新开的 `claude`/`codex` 都自动占一盏灯，无需逐项目配置 `sessionKey`（原理见 [ARCHITECTURE.md](./ARCHITECTURE.md) 数据流一节）。

**本工具不会自动修改你的配置文件**——按下面步骤手动编辑，且 Claude Code 会提示是否信任要执行的 hook 命令，请确认脚本来源（`scripts/cms-hook-forward.sh` 的绝对路径）后再允许。

### 安装

把 `scripts/cms-hook-forward.sh`（**用绝对路径**）append 到 `~/.claude/settings.json` 的四个 hook 事件：`UserPromptSubmit`、`PreToolUse`、`Stop`、`Notification`，每条命令前缀 `CMS_HOOK_AGENT=claude-code`（Codex 侧同理装到 `~/.codex/hooks.json`，前缀换成 `CMS_HOOK_AGENT=codex`）。**是 append，不要覆盖已有的 hooks 配置**。原始 JSON 片段格式见 [scripts/install-hooks.md](../scripts/install-hooks.md)（注意：该文档的示例片段还带着旧版 `CMS_SESSION_KEY=cms-claude-0` 静态写法；全局自动分槽模式下 `CMS_SESSION_KEY` 只是 stdin 缺 `session_id` 时的兜底，官方 hook stdin 正常总带 `session_id`，可以不传这个变量）。

转发脚本本身依赖 `jq` 和 `curl`（缺一即静默跳过、`exit 0`，不影响你正常使用 claude/codex）。

### 验证

```bash
curl -sS -X POST "http://127.0.0.1:7788/ingest/hook" \
  -H 'content-type: application/json' \
  -d '{"agent":"claude-code","channel":"hooks","sessionKey":"test-1","payload":{"hook_event_name":"PreToolUse"}}'
# 期望：{"ok":true}
```

装完后随便找个目录跑一次 `claude`，手机 `/m?token=...&live=1` 应该能看到一盏灯亮起并标注该项目名（cwd basename）。

### 卸载

1. 编辑 `~/.claude/settings.json`（Codex 编辑 `~/.codex/hooks.json`），删掉四处含 `cms-hook-forward` 的 hook 组，其余 hooks 不动；或直接用安装时留的备份 `~/.claude/settings.json.bak-<时间戳>` 覆盖回去。
2. 删完立即恢复原样，零残留。
3. 即使不卸载也无害：Host 没开着时转发脚本永远 `exit 0`、约 6ms 返回、不产生任何报错噪音（fire-and-forget 已硬化），对正常使用 claude/codex 零影响。

## App 构建

### 环境

Flutter SDK（`app/pubspec.yaml` 要求 Dart `^3.7.2`）。核心依赖：`web_socket_channel`（WS 客户端）、`mobile_scanner`（扫码配对）、`shared_preferences`（本地存配对信息）、`speech_to_text`（语音派活）、`audioplayers`（键音播放，当前播放链路尚未真正接通，见 [ARCHITECTURE.md §5](./ARCHITECTURE.md#5-已知差异代码-vs-文档spec-描述供后续修复参考) 第 1 条）。

### 运行 / 构建

```bash
cd app
flutter pub get
flutter run                      # 真机/模拟器调试
flutter run --dart-define=PAIR_URL='http://192.168.x.x:7788/m?token=xxx&live=1'  # 开发捷径：跳过手输配对链接，启动即自动连
flutter build apk                # Android 产物
flutter build ios                # iOS 产物（需 Xcode 签名配置）
```

### iOS 部署目标与权限

- 部署目标 **iOS 13.0**（`app/ios/Podfile`：`platform :ios, '13.0'`）。
- `app/ios/Runner/Info.plist` 已声明三项权限用途说明：`NSMicrophoneUsageDescription`（语音派活录音）、`NSSpeechRecognitionUsageDescription`（语音转文字）、`NSCameraUsageDescription`（扫码配对用相机）。首次触发对应功能系统会弹出授权请求，拒绝后需去 iOS 设置里手动开启。
- Android 侧对应权限（麦克风、相机）由 `speech_to_text`/`mobile_scanner` 插件自带的 Manifest 片段自动合并，无需手动加。

### 真机 / 模拟器注意

- **语音识别（`speech_to_text`）和扫码（`mobile_scanner`）在真机上体验最完整**；iOS 模拟器没有摄像头、部分模拟器环境语音识别不可用或延迟异常，`_KeyboardScreenState._initSpeech` 已做了失败降级（`_speechAvailable=false` 时 PTT 提示"语音识别不可用，改用键盘"，不会崩）。
- 触感（`Haptics`）在模拟器上大多是静默 no-op（模拟器没有振动马达/Taptic Engine），只有真机能验证咔嗒感是否符合预期。
- App 键音目前听不到声音属已知限制（合成逻辑已完成，播放链路是占位符），不是真机问题，见上文链接。
- 首次 `flutter run` 到真机 iOS 需要在 Xcode 里配置开发者签名（`app/ios/Runner.xcworkspace`），CocoaPods 依赖已随仓库带 `Podfile.lock`，正常 `pod install` 应可直接复现。

## 网页访问回顾

- 桌面开发面：`http://<CMS_HOST>:<CMS_PORT>/`（`web/index.html`，左键盘 + 右 xterm 真终端，本机开发调试用）。
- 手机拟物玩具：`/m`（`web/m.html`）——不带 `?token=&live=1` 是 Demo 模式（假数据，纯前端演示，不连 Host 状态）；带上才是 Live 模式。
- 鉴权：非 loopback 来源必须携带有效 token；`/m` 鉴权失败时返回一个引导页（不是裸 401），提示去 `/pair` 重新进入；其余路径鉴权失败直接 401。`/m` 首次带 token 访问成功后会种一个 `cms_token` cookie（HttpOnly、SameSite=Lax、24 小时），让浏览器后续加载 ES module/样式等子资源请求也能过鉴权（这些子资源请求本身不会带 query token 或 header）。
