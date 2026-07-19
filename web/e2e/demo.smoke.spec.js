// demo.smoke.spec.js — 无头浏览器冒烟测：验证 Demo 模式静态站真的能渲染键盘、
// 不报 JS 错、且假 agent 剧本真的在跑（不是死页面）。
//
// selector 依据（读 web/toy/keyboard.js 的渲染函数得出）：
//   - `.toy-stage`         键盘组件根节点（createToyKeyboard 渲染的最外层容器）
//   - `[data-agent]`       6 个 agent 键（data-agent="0".."5"），初始 class 含 `a-idle`
//   - `[data-lcd-m]`       LCD 主文案 span；demo 模式启动即 setLcd(t('demo.boot'))
//   - `a-thinking|a-complete|a-needs_input|a-error`
//     demo-script.js 的 createDemoDirector 会在 500-4000ms 初始延迟后把某个
//     slot 从 idle 推进到 thinking（见 scheduleInitialStart→beginThinking），
//     所以「至少一盏灯进入非 idle 态」在 8s 超时内应必然发生。

import { test, expect } from '@playwright/test';

test.describe('OpenMicro demo 静态站冒烟测', () => {
  test('页面加载无 console error / pageerror', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto('/index.html');
    // 给 demo 剧本一点时间跑起来（idle→thinking 的调度是异步 timer），
    // 顺带把这段时间内可能冒出的运行时错误也纳入断言窗口。
    await page.waitForTimeout(1500);

    expect(consoleErrors, `console errors: ${JSON.stringify(consoleErrors)}`).toEqual([]);
    expect(pageErrors, `page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
  });

  test('键盘根节点渲染出来，且 6 个 agent 键都在', async ({ page }) => {
    await page.goto('/index.html');

    const stage = page.locator('.toy-stage');
    await expect(stage).toBeVisible();

    const agentKeys = page.locator('[data-agent]');
    await expect(agentKeys).toHaveCount(6);
    // 6 个键的 data-agent 应恰好是 0..5（结构完整性，不是随便 6 个元素）。
    const ids = await agentKeys.evaluateAll((els) => els.map((el) => el.dataset.agent).sort());
    expect(ids).toEqual(['0', '1', '2', '3', '4', '5']);
  });

  test('LCD 区域有文字，且 demo 演戏后至少一盏灯进入非 idle 态', async ({ page }) => {
    await page.goto('/index.html');

    const lcdText = page.locator('[data-lcd-m]');
    await expect(lcdText).not.toHaveText('');

    // demo-script.js: 每个 slot 初始延迟 500-4000ms 后进入 thinking；
    // 8s 足够覆盖最坏情况（6 个 slot 里最快那个），且不会把测试拖得太久。
    await page.waitForFunction(
      () =>
        document.querySelector(
          '.toy-agent.a-thinking, .toy-agent.a-complete, .toy-agent.a-needs_input, .toy-agent.a-error'
        ) !== null,
      { timeout: 8000 }
    );
  });
});
