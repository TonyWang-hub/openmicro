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

`Notification` 示例从 stdin 读取完整 JSON payload（含 `hookEventName` 与 `notificationType`）。

---

## Codex（优先 hooks）

推荐在 Codex 配置中使用 hooks 通道，覆盖 `SessionStart`、`PreToolUse`、`PermissionRequest`、`Stop`：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "CMS_HOOK_AGENT=codex CMS_SESSION_KEY=cms-codex-1 /path/to/cms-hook-forward.sh '{\"hookEventName\":\"SessionStart\"}'"
      }
    ],
    "PreToolUse": [
      {
        "type": "command",
        "command": "CMS_HOOK_AGENT=codex CMS_SESSION_KEY=cms-codex-1 /path/to/cms-hook-forward.sh '{\"hookEventName\":\"PreToolUse\"}'"
      }
    ],
    "PermissionRequest": [
      {
        "type": "command",
        "command": "CMS_HOOK_AGENT=codex CMS_SESSION_KEY=cms-codex-1 /path/to/cms-hook-forward.sh '{\"hookEventName\":\"PermissionRequest\"}'"
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "CMS_HOOK_AGENT=codex CMS_SESSION_KEY=cms-codex-1 /path/to/cms-hook-forward.sh '{\"hookEventName\":\"Stop\"}'"
      }
    ]
  }
}
```

### Legacy `notify` 兼容

若环境仍使用旧版 notify，设置 `CMS_HOOK_CHANNEL=notify-legacy`：

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
  -d '{"agent":"claude-code","channel":"hooks","sessionKey":"cms-claude-0","payload":{"hookEventName":"PreToolUse"}}'
```

期望响应：`{"ok":true}`
