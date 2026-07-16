# Hook 安装指南

> **重要：本工具不会自动修改你的配置文件。** 请手动复制下方片段到对应位置，并确认路径与环境变量正确。

`cms-hook-forward.sh` 依赖 `jq` 与 `curl`。将脚本加入 `PATH`，或在片段中使用绝对路径。

---

## 环境变量（转发脚本）

| 变量 | 必填 | 说明 |
|---|---|---|
| `CMS_HOOK_AGENT` | 是 | `claude-code` 或 `codex` |
| `CMS_SESSION_KEY` | 是 | 与 CMS 槽位绑定的 sessionKey，如 `cms-claude-0` |
| `CMS_HOOK_CHANNEL` | 否 | 默认 `hooks`；legacy notify 用 `notify-legacy` |
| `CMS_PORT` | 否 | CMS Host 端口，默认 `7788` |

Host 默认只监听 `127.0.0.1`（见 README / `CMS_HOST`）。

官方 stdin 常用 `hook_event_name` / `notification_type`（snake_case）；适配器同时接受 camelCase。

---

## Claude Code

在**项目** `.claude/settings.json` 或用户级 `~/.claude/settings.json` 中添加 hooks。  
**需用户信任**：Claude Code 会提示是否允许执行 hook 命令，请确认脚本来源后再允许。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "CMS_HOOK_AGENT=claude-code CMS_SESSION_KEY=cms-claude-0 /path/to/cms-hook-forward.sh '{\"hookEventName\":\"PreToolUse\"}'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "CMS_HOOK_AGENT=claude-code CMS_SESSION_KEY=cms-claude-0 /path/to/cms-hook-forward.sh '{\"hookEventName\":\"Stop\"}'"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "CMS_HOOK_AGENT=claude-code CMS_SESSION_KEY=cms-claude-0 /path/to/cms-hook-forward.sh"
          }
        ]
      }
    ]
  }
}
```

`Notification` 示例从 stdin 读取完整 JSON payload（含 `hookEventName`/`hook_event_name` 与 `notificationType`/`notification_type`）。

---

## Codex（优先 hooks）

官方格式：事件名 → **matcher 组**数组 → 每组含可选 `matcher` + 嵌套 `hooks` 数组。  
配置通常放在 `~/.codex/hooks.json`（或项目 `.codex/hooks.json`；以当前 Codex 文档为准）。

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "CMS_HOOK_AGENT=codex CMS_SESSION_KEY=cms-codex-1 /path/to/cms-hook-forward.sh"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "CMS_HOOK_AGENT=codex CMS_SESSION_KEY=cms-codex-1 /path/to/cms-hook-forward.sh"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "CMS_HOOK_AGENT=codex CMS_SESSION_KEY=cms-codex-1 /path/to/cms-hook-forward.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "CMS_HOOK_AGENT=codex CMS_SESSION_KEY=cms-codex-1 /path/to/cms-hook-forward.sh"
          }
        ]
      }
    ]
  }
}
```

官方会在 stdin 写入含 `hook_event_name` 的 JSON；转发脚本把 stdin（或 argv）原样 POST 到 Host，无需在 command 里硬编码事件名。

---

## Legacy `notify` 兼容（已弃用）

若环境仍使用旧版 `notify`（仅常见 `agent-turn-complete`），在**用户级** `~/.codex/config.toml` 配置（项目级 `.codex/config.toml` 会忽略 `notify`）：

```toml
# Deprecated — prefer lifecycle hooks above. Still works for complete→idle only.
notify = [
  "env",
  "CMS_HOOK_AGENT=codex",
  "CMS_HOOK_CHANNEL=notify-legacy",
  "CMS_SESSION_KEY=cms-codex-1",
  "/path/to/cms-hook-forward.sh",
]
```

Codex 会把 JSON payload 作为**最后一个 argv** 传给命令（例如 `{"type":"agent-turn-complete",...}`）。  
也可包一层小脚本读 `$1` 再调 forward；手动探测：

```bash
CMS_HOOK_AGENT=codex \
CMS_HOOK_CHANNEL=notify-legacy \
CMS_SESSION_KEY=cms-codex-1 \
/path/to/cms-hook-forward.sh '{"type":"agent-turn-complete"}'
```

---

## Codex app-server（可选，Task 8）

app-server 状态 ingest **仅在 Host 启用特性开关时有效**：

```bash
export CMS_CODEX_APP_SERVER=1   # 在启动 CMS Host 前设置
```

未设置 `CMS_CODEX_APP_SERVER=1` 时，`channel: app-server` 请求会被静默忽略（200 `{ok:true}`，不改变灯态）。  
完整 app-server 接线见 Task 8 实现。

---

## 验证

Host 运行后，手动探测：

```bash
curl -sS -X POST "http://127.0.0.1:7788/ingest/hook" \
  -H 'content-type: application/json' \
  -d '{"agent":"claude-code","channel":"hooks","sessionKey":"cms-claude-0","payload":{"hook_event_name":"PreToolUse"}}'
```

期望响应：`{"ok":true}`
