#!/usr/bin/env bash
# scripts/start.sh — 一键启动 OpenMicro Host（本机开发/日常使用）。
#
# 做的事（按顺序）：
#   1. 检查 node / jq / curl 是否在 PATH（jq、curl 是全局 hooks 转发脚本
#      scripts/cms-hook-forward.sh 的运行时依赖，不装 Host 本身也能跑；
#      缺失时只提示，不阻断，因为该脚本本来就设计成缺依赖就静默 exit 0）。
#   2. 若仓库根目录存在 .env，加载它（参考 .env.example 创建）。
#   3. 若 node_modules 不存在，先 npm install（会触发 postinstall 修复
#      node-pty 打包丢失的可执行位）。
#   4. npm start 启动 Host，并打印配对提示。
#
# 用法：
#   bash scripts/start.sh
#
# 手机/局域网连接需要先在 .env 里设 CMS_HOST=0.0.0.0 + 固定的 CMS_TOKEN，
# 见 .env.example 顶部的安全提醒。

set -euo pipefail

# 脚本可能从任意 cwd 被调用，先定位到仓库根目录（scripts/ 的上一级）。
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "[start.sh] 仓库根目录: $ROOT_DIR"

# ---- 1. 依赖检查（仅提示，node 缺失才会阻断）----
check_cmd() {
  local cmd="$1"
  local hint="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "[start.sh] ok  $cmd 已安装"
  else
    echo "[start.sh] !!  未找到 $cmd —— $hint"
  fi
}

if ! command -v node >/dev/null 2>&1; then
  echo "[start.sh] 缺少 node，无法继续。请先安装 Node.js >=22（见 package.json engines 字段）。"
  exit 1
fi
check_cmd node "Host 运行必需"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "[start.sh] 警告：当前 Node 版本 $(node -v)，package.json 要求 >=22，可能无法正常运行。"
fi

check_cmd jq "全局 hooks 转发脚本 scripts/cms-hook-forward.sh 依赖它；缺失时该脚本静默跳过转发，不影响 Host 本身"
check_cmd curl "同上，转发脚本用它把 hook 事件 POST 给 Host"

# ---- 2. 加载 .env（若存在）----
if [ -f "$ROOT_DIR/.env" ]; then
  echo "[start.sh] 发现 .env，加载环境变量"
  set -o allexport
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +o allexport
else
  echo "[start.sh] 未找到 .env（可选）。使用内置默认值。如需自定义，先 cp .env.example .env 再改。"
fi

# ---- 3. 装依赖（缺 node_modules 才装，避免每次启动都跑一遍 npm install）----
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "[start.sh] 未发现 node_modules，执行 npm install ..."
  npm install
else
  echo "[start.sh] node_modules 已存在，跳过 npm install（强制重装：rm -rf node_modules 后重跑本脚本）"
fi

# ---- 4. 打印配对提示（真实的 IP/token 由 Host 自己在日志里打印，这里只给方向）----
HOST_ADDR="${CMS_HOST:-127.0.0.1}"
PORT_ADDR="${CMS_PORT:-7788}"
echo "[start.sh] 即将启动 Host ..."
echo "[start.sh] 桌面开发面（本机浏览器打开）：http://127.0.0.1:${PORT_ADDR}"
if [ "$HOST_ADDR" = "127.0.0.1" ] || [ "$HOST_ADDR" = "localhost" ]; then
  echo "[start.sh] 当前只监听 loopback，手机连不上。要手机连接：在 .env 设 CMS_HOST=0.0.0.0 和固定的 CMS_TOKEN 后重跑本脚本。"
else
  echo "[start.sh] 手机配对：启动日志会打印形如 http://<局域网IP>:${PORT_ADDR}/m?token=... 的链接；也可电脑访问 http://127.0.0.1:${PORT_ADDR}/pair 扫二维码。"
fi

# ---- 5. 启动 ----
exec npm start
