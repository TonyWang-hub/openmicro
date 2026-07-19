# OpenMicro 公开发布清单

> 本文件是「备好一切等手动推」的交接单。**代码侧准备已全部完成**，剩下的每一步都由你手动执行——本仓当前**无 remote**，不会被任何自动化推到公网。

## ✅ 已完成（代码侧）

- **定名 OpenMicro**：显示名/包名/i18n 文案全部改写；保留 `com.microtoy` MethodChannel 与 bundle id（改动会断原生构建，商店发布时再改）。
- **开源治理齐全**：MIT `LICENSE`（版权归 *OpenMicro contributors*）、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SECURITY.md`、`CHANGELOG.md`、`.github/`（issue/PR 模板 + 三端 CI）。
- **PII 脱敏**：
  - 全部历史 commit 作者已从 `the maintainer <maintainer@users.noreply.github.com>` 改写为 `TonyWang-hub <TonyWang-hub@users.noreply.github.com>`（GitHub noreply，永不暴露真邮箱）。旧身份对象已 gc 清除。
  - 本仓 `git config --local` 已设为同一化名，未来提交自动沿用。
  - 内容扫描：无 example / 网关 key / 真名残留；网关 key 仅在仓外 `~/.codex/config.toml`，未进仓。绝对路径 `/home/user/...` 已从 spec 移除。
- **三端全绿**：Host 153、web 18、App analyze 干净 + 24 测试。
- **改写前备份**：`../codex-micro-sim-preRewrite-c9c166a.bundle`（含改写前所有原始 commit，需回滚时 `git clone <bundle>`）。

## 🚀 你要手动做的（按序）

1. **确定 GitHub 命名空间**，替换 `CHANGELOG.md` 里的 `YOUR-GITHUB-ORG` token（第 28-29 行的对比链接）：
   ```bash
   sed -i '' 's/YOUR-GITHUB-ORG/<你的github用户名或org>/g' CHANGELOG.md
   git commit -am 'docs: fill changelog compare links'
   ```
2. **在 GitHub 建空的公开仓** `openmicro`（不要勾选自动生成 README/LICENSE，避免首推冲突）。
3. **接 remote 并推**（确认 local 身份是化名——已设好）：
   ```bash
   git config --local user.email   # 应输出 TonyWang-hub@users.noreply.github.com
   git remote add origin git@github.com:<你>/openmicro.git
   git push -u origin main
   ```
4. **（可选）本地目录改名** `codex-micro-sim` → `openmicro`：会让 `app/ios/Flutter/flutter_export_environment.sh` 等生成文件的绝对路径失效，改完在 `app/` 跑一次 `flutter pub get` + `flutter clean` 重生成即可。
5. **仓库 About**：填一句 tagline + 在 Security policy 里确认 GitHub Security Advisories 已开（`SECURITY.md` 指向它）。

## ⏳ 需真机/设备才能验收（推之后可作为 v0.1 已知项）

- iOS/Android 真机：CoreHaptics / VibrationEffect 触感、麦克风语音派活、mobile_scanner 扫码配对。
- 局域网多设备并发下的 WS 稳定性。

## ⚠️ 不要做

- 不要在没设 `--local` 化名的机器上提交（会用回全局 `the maintainer <…@example.com>`）。
- 不要把 `~/.codex/config.toml`（含真实网关 key）纳入任何仓库。
