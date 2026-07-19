#!/usr/bin/env node
// build-demo.mjs — 把 web/ 的 Demo 模式打成一个「任意子路径都能跑」的静态站点。
//
// 为什么需要构建：m.html 用的是站点根绝对路径（`/toy/…`、`/sw.js`），这在
// GitHub Pages 项目页（`<user>.github.io/openmicro/` 子路径）下会解析错。
// Demo 模式本身零 Host 依赖（web/toy/* 内部 import 全是相对路径），所以只需
// 把入口 m.html 的绝对路径改成相对、并去掉只在 Live/PWA 场景才有用的
// service worker 注册，就能纯静态托管。
//
// 产物：<out>/index.html（= 改写后的 Demo 入口）+ <out>/toy/（原样拷贝 + 相对化 manifest）。
// 无第三方依赖，Node ≥ 16.7（fs.cpSync）。默认输出 demo-dist/。

import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, 'web');
const outDir = resolve(process.argv[2] || join(root, 'demo-dist'));

/** 把 m.html 改写成子路径安全的静态入口。 */
function buildIndexHtml() {
  let html = readFileSync(join(webDir, 'm.html'), 'utf8');
  // 整段删掉 PWA 注释 + service worker 注册：静态 Demo 不需要离线壳，子路径下
  // scope 会错；连注释一起删，避免里面的 /toy/、/sw.js 字样污染子路径安全断言。
  html = html.replace(
    /\n\s*\/\/ PWA offline shell:[\s\S]*?\n\s{4}\}/,
    '\n    // (service worker registration omitted in the static demo build)'
  );
  // 站点根绝对路径 → 显式相对路径 `./toy/`。注意 JS 的 import 必须带 `./`，
  // 否则 `toy/x.js` 会被当成裸模块说明符（像 npm 包）而解析失败；`./toy/` 对
  // <link href> / import 都成立，故统一改成 `./toy/`。
  html = html.replace(/(["'(])\/toy\//g, '$1./toy/');
  // 兜底：若还残留任何 /sw.js 引用，相对化。
  html = html.replace(/(["'(])\/sw\.js/g, '$1./sw.js');
  return html;
}

/** 拷贝 toy 资源并把 manifest 里的绝对路径相对化。 */
function copyToy() {
  cpSync(join(webDir, 'toy'), join(outDir, 'toy'), { recursive: true });
  const mfPath = join(outDir, 'toy', 'manifest.json');
  const mf = JSON.parse(readFileSync(mfPath, 'utf8'));
  mf.start_url = '.';
  mf.scope = '.';
  for (const icon of mf.icons || []) {
    icon.src = String(icon.src).replace(/^\/toy\//, '').replace(/^\//, '');
  }
  writeFileSync(mfPath, JSON.stringify(mf, null, 2) + '\n');
}

function main() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  copyToy();
  writeFileSync(join(outDir, 'index.html'), buildIndexHtml());
  // GitHub Pages: 关掉 Jekyll，避免它吞掉以 _ 开头的文件/做多余处理。
  writeFileSync(join(outDir, '.nojekyll'), '');
  console.log(`demo built → ${outDir}`);
}

main();
