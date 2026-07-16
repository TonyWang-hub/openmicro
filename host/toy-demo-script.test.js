import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoDirector } from '../web/toy/demo-script.js';

// 加速时钟：把 spec 里的秒级延时压到毫秒级，测试用，生产不传。
const FAST_TIME_SCALE = 0.02;

function makeRecorder() {
  const states = [];
  const lcds = [];
  const focuses = [];
  return {
    states,
    lcds,
    focuses,
    onState: (slotId, state) => states.push({ slotId, state, t: Date.now() }),
    onLcd: (text) => lcds.push({ text, t: Date.now() }),
    onFocus: (slotId) => focuses.push(slotId),
  };
}

function waitFor(predicate, { timeout = 4000, interval = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    (function tick() {
      const value = predicate();
      if (value) {
        resolve(value);
        return;
      }
      if (Date.now() - startedAt > timeout) {
        reject(new Error('waitFor timed out'));
        return;
      }
      setTimeout(tick, interval);
    })();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('needs_input 后 approve → complete', async () => {
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: FAST_TIME_SCALE });
  director.start();
  try {
    const hit = await waitFor(() => rec.states.find((s) => s.state === 'needs_input'));
    const hitIndex = rec.states.indexOf(hit);
    director.approve(hit.slotId);

    await waitFor(() =>
      rec.states
        .slice(hitIndex + 1)
        .some((s) => s.slotId === hit.slotId && s.state === 'complete'),
    );

    const thankSaid = rec.lcds.some((l) => l.t >= hit.t && /多谢|感谢|英明|马力全开/.test(l.text));
    assert.ok(thankSaid, '期望 approve 后出现感谢文案');
  } finally {
    director.stop();
  }
});

test('needs_input 后 reject → error → idle', async () => {
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: FAST_TIME_SCALE });
  director.start();
  try {
    const hit = await waitFor(() => rec.states.find((s) => s.state === 'needs_input'));
    const hitIndex = rec.states.indexOf(hit);
    director.reject(hit.slotId);

    const errored = await waitFor(() =>
      rec.states
        .slice(hitIndex + 1)
        .find((s) => s.slotId === hit.slotId && s.state === 'error'),
    );
    const erroredIndex = rec.states.indexOf(errored);

    await waitFor(() =>
      rec.states
        .slice(erroredIndex + 1)
        .some((s) => s.slotId === hit.slotId && s.state === 'idle'),
    );

    const complained = rec.lcds.some((l) => l.t >= hit.t && /脏话|摆烂|生闷气|崩了/.test(l.text));
    assert.ok(complained, '期望 reject 后出现吐槽文案');
  } finally {
    director.stop();
  }
});

test('needs_input 20s 无人理会自动 complete', async () => {
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: FAST_TIME_SCALE });
  director.start();
  try {
    const hit = await waitFor(() => rec.states.find((s) => s.state === 'needs_input'));
    const hitIndex = rec.states.indexOf(hit);

    // 不调用 approve/reject，只等超时自动 complete。
    const completed = await waitFor(
      () =>
        rec.states
          .slice(hitIndex + 1)
          .find((s) => s.slotId === hit.slotId && s.state === 'complete'),
      { timeout: 5000 },
    );

    assert.ok(completed.t - hit.t >= 20000 * FAST_TIME_SCALE - 50, '应等待接近 20s(缩放后) 才自动 complete');
  } finally {
    director.stop();
  }
});

test('approve 对非 needs_input 状态是幂等无操作', () => {
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: FAST_TIME_SCALE });
  director.start();
  try {
    // start() 后同步设置的初始状态都是 idle，此时定时器还未触发。
    const beforeCount = rec.states.filter((s) => s.slotId === 0).length;
    assert.equal(beforeCount, 1);
    assert.equal(rec.states[0].state, 'idle');

    director.approve(0); // idle 状态下调用 approve 应该无操作

    const afterCount = rec.states.filter((s) => s.slotId === 0).length;
    assert.equal(afterCount, beforeCount, 'idle 状态下 approve 不应产生新的状态变化');
  } finally {
    director.stop();
  }
});

test('stop() 后不再有任何回调', async () => {
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: FAST_TIME_SCALE });
  director.start();
  try {
    await sleep(150); // 让若干 slot 跑过几轮生活线
    director.stop();

    const statesAfterStop = rec.states.length;
    const lcdsAfterStop = rec.lcds.length;

    await sleep(300); // 停止后继续等待，确认没有新回调

    assert.equal(rec.states.length, statesAfterStop, 'stop() 后不应再有 onState 回调');
    assert.equal(rec.lcds.length, lcdsAfterStop, 'stop() 后不应再有 onLcd 回调');
  } finally {
    director.stop();
  }
});

test('voicePrompt 触发 thinking + LCD 派活文案', () => {
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: FAST_TIME_SCALE });
  director.start();
  try {
    director.voicePrompt(2);

    const lastStateForSlot2 = [...rec.states].reverse().find((s) => s.slotId === 2);
    assert.equal(lastStateForSlot2.state, 'thinking');

    const lastLcd = rec.lcds[rec.lcds.length - 1];
    assert.ok(lastLcd.text.startsWith('语音已派活：'), '期望 LCD 出现语音派活文案');
  } finally {
    director.stop();
  }
});
