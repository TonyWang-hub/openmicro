// playwright.config.js — 只跑 e2e/ 下的无头浏览器冒烟测。
// 与 web/test/**/*.test.js（node --test，无浏览器）分开：那批是纯字符串/逻辑
// 断言，这里才是"真的用 Chromium 渲染出键盘"的验证。
//
// webServer 负责：先执行 build-demo.mjs 产出 demo-dist/，再用零依赖的
// e2e/static-server.mjs 把它 serve 起来；Playwright 等 url 就绪后才跑测试，
// 结束后自动杀掉 server。

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `node ../scripts/build-demo.mjs ./demo-dist && node e2e/static-server.mjs ${PORT} ./demo-dist`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
