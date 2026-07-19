// build-demo.test.js — 无浏览器验证静态 Demo 构建产物：子路径安全 + 资源齐全 + 无绝对路径。
// 跑法：node --test（CI web job 已覆盖 test/**/*.test.js）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const buildScript = join(repoRoot, 'scripts', 'build-demo.mjs');

/** 构建到一个临时目录，返回其路径；调用方负责清理。 */
function buildToTemp() {
  const out = mkdtempSync(join(tmpdir(), 'openmicro-demo-'));
  execFileSync(process.execPath, [buildScript, out], { stdio: 'pipe' });
  return out;
}

test('demo build 产出入口与全部 toy 资源', () => {
  const out = buildToTemp();
  try {
    for (const rel of [
      'index.html', '.nojekyll',
      'toy/keyboard.js', 'toy/keyboard.css', 'toy/i18n.js',
      'toy/demo-script.js', 'toy/audio.js', 'toy/haptics.js',
      'toy/manifest.json', 'toy/icon.svg',
    ]) {
      assert.ok(existsSync(join(out, rel)), `缺少产物 ${rel}`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('index.html 子路径安全：无站点根绝对引用、无 service worker 注册', () => {
  const out = buildToTemp();
  try {
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    // 不得再出现 /toy/ 或 /sw.js 这类根绝对路径（会在 Pages 子路径下解析错）。
    assert.doesNotMatch(html, /["'(]\/toy\//, 'index.html 仍有绝对 /toy/ 引用');
    assert.doesNotMatch(html, /\/sw\.js/, 'index.html 仍引用 /sw.js');
    assert.doesNotMatch(html, /serviceWorker\.register/, 'index.html 仍注册 service worker');
    // 入口确实加载 Demo 键盘，且 import 必须是显式相对（`./toy/`）——裸说明符
    // `toy/keyboard.js` 会被浏览器当 npm 包解析而 404，这里正是回归防线。
    assert.match(html, /from ['"]\.\/toy\/keyboard\.js['"]/, 'toy/keyboard.js import 不是显式相对 ./');
    assert.doesNotMatch(html, /from ['"]toy\//, 'import 用了裸模块说明符 toy/（应为 ./toy/）');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('manifest 相对化且可解析', () => {
  const out = buildToTemp();
  try {
    const mf = JSON.parse(readFileSync(join(out, 'toy', 'manifest.json'), 'utf8'));
    assert.equal(mf.start_url, '.');
    assert.equal(mf.scope, '.');
    for (const icon of mf.icons || []) {
      assert.doesNotMatch(icon.src, /^\//, `icon.src 不应是绝对路径: ${icon.src}`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
