#!/usr/bin/env node
// static-server.mjs — 零依赖静态文件服务器，只为 Playwright 冒烟测服务
// demo-dist/（build-demo.mjs 的产物）。不引入 http-server / serve 等三方包，
// 复用 Node 内置 http + fs 即可满足"打开 index.html + 加载 toy/*"的最小需求。
//
// 用法：node e2e/static-server.mjs [port] [rootDir]
// 默认 port=4173，rootDir=<web>/demo-dist（相对本文件）。

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2]) || 4173;
const rootDir = process.argv[3] ? join(process.cwd(), process.argv[3]) : join(here, '..', 'demo-dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function resolveFile(urlPath) {
  // 去掉 query/hash，防止路径穿越（normalize 后必须仍在 rootDir 内）。
  const cleanPath = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  let rel = cleanPath === '/' ? '/index.html' : cleanPath;
  let full = normalize(join(rootDir, rel));
  if (!full.startsWith(rootDir)) return null;
  try {
    const st = await stat(full);
    if (st.isDirectory()) full = join(full, 'index.html');
  } catch {
    return null;
  }
  try {
    await stat(full);
    return full;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const file = await resolveFile(req.url || '/');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  try {
    const body = await readFile(file);
    const type = MIME[extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('server error');
  }
});

server.listen(port, () => {
  console.log(`demo static server → http://localhost:${port} (root: ${rootDir})`);
});
