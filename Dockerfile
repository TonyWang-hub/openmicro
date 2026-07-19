# Dockerfile — codex-micro-sim Host 容器镜像
#
# ============================================================
# 边界：容器版 Host 只能"监控"，不能"远程按键注入"
# ============================================================
# accept/reject（◎✓/⊗）和语音派活，本质是把按键真的发回某个真实会话的
# 终端——靠 `tmux send-keys` 或 cmux CLI（`cmux send` / `send-key --surface`）
# 完成，而那个 tmux 会话 / cmux GUI 进程本来就跑在**宿主机**（你的电脑）上。
# 容器里既没有宿主机的 tmux socket，也接触不到宿主机的 cmux 进程，因此：
#   - 灯效正常：hooks 事件照样能 POST 进容器里的 /ingest/hook，6 槽状态机
#     正常点灯、显示项目名。
#   - 按键必失败：点 accept/reject 或语音派活会得到"不在 tmux/cmux，
#     无法远程按键"的提示（这是既有失败路径，不是 bug）。
# 想要完整能力（按键注入 + 语音派活），请用 scripts/start.sh 直接在宿主机
# 跑 Host（见根 README.md「快速开始」）。这个镜像只适合"只要看灯监控看板，
# 不需要远程操作"的场景，例如放一台常驻小机器上做纯展示。
#
# node-pty 是原生模块：alpine 用 musl libc，node-pty 的 prebuilds 通常是
# glibc 版，装不上时会退回源码编译，因此镜像里带了 python3/make/g++。

FROM node:22-alpine

RUN apk add --no-cache jq curl python3 make g++

WORKDIR /app

# 先拷贝构建所需的最小文件集，让 Docker 层缓存在依赖不变时生效。
# scripts/ 里的 fix-node-pty-perms.js 是 package.json postinstall 钩子依赖的
# 现有脚本（未做任何修改），必须先于 npm ci 拷进来。
COPY package.json package-lock.json ./
COPY scripts/ ./scripts/
RUN npm ci --omit=dev

COPY host/ ./host/
COPY web/ ./web/

EXPOSE 7788

# 容器内必须监听 0.0.0.0，否则宿主机的端口映射 (-p 7788:7788) 转发不进来
# （宿主机连的是映射端口，不是容器内的 127.0.0.1）。
# ⚠️ 这意味着鉴权完全依赖 CMS_TOKEN——运行时务必显式传入一个非空 token
#    （见 docker-compose.yml / .env.example），不要用随机生成的默认值。
ENV CMS_HOST=0.0.0.0

# npm ci 的 postinstall 钩子（scripts/fix-node-pty-perms.js）已经在构建期修过
# node-pty 的可执行位，这里直接跑 host/index.js 而不是 `npm start`，省一次
# 重复的 perms 检查。
CMD ["node", "host/index.js"]
