import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoDirector } from '../toy/demo-script.js';

const NEEDS_INPUT_PROMPTS_HINT = '批吗？'; // 至少一条 NEEDS_INPUT_PROMPTS 文案含此片段（第一条）
const VOICE_TASK_PREFIX = '语音已派活：';
const THANK_YOU_HINT = '多谢老板签字'; // THANK_YOU_MESSAGES[0]
const COMPLAIN_HINT = '被拒了'; // COMPLAIN_MESSAGES[0]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeout = 500, interval = 5 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(interval);
  }
  return predicate();
}

function makeRecorder() {
  const states = []; // [slotId, state][]
  const lcds = []; // string[]
  const focuses = []; // slotId[]
  return {
    states,
    lcds,
    focuses,
    onState: (slotId, state) => states.push([slotId, state]),
    onLcd: (text) => lcds.push(text),
    onFocus: (slotId) => focuses.push(slotId),
  };
}

test('start() 立即为所有 6 个 slot 同步下发 idle', () => {
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: 0.001 });
  director.start();
  const idleEvents = rec.states.filter(([, state]) => state === 'idle');
  assert.equal(idleEvents.length, 6);
  const slotIds = idleEvents.map(([slotId]) => slotId).sort((a, b) => a - b);
  assert.deepEqual(slotIds, [0, 1, 2, 3, 4, 5]);
  director.stop();
});

test('Math.random 恒为 0 时：生活线沿 idle -> thinking -> needs_input 推进，且 LCD 为喊话文案', async (t) => {
  t.mock.method(Math, 'random', () => 0);
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: 0.002 });
  director.start();

  const reachedNeedsInput = await waitFor(() =>
    rec.states.some(([slotId, state]) => slotId === 0 && state === 'needs_input')
  );
  assert.ok(reachedNeedsInput, '应在超时前进入 needs_input');
  assert.ok(rec.lcds.some((text) => text.includes(NEEDS_INPUT_PROMPTS_HINT)));

  director.stop();
});

test('approve() 在 needs_input 状态下同步转 complete，并携带感谢文案', async (t) => {
  t.mock.method(Math, 'random', () => 0);
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: 0.002 });
  director.start();

  await waitFor(() => rec.states.some(([slotId, state]) => slotId === 0 && state === 'needs_input'));

  const beforeCount = rec.states.length;
  director.approve(0);
  // approve() 内部走 safeRun 同步调用 enterComplete，状态应立刻可见（无需等待）。
  assert.ok(rec.states.length > beforeCount);
  const lastState = rec.states.at(-1);
  assert.deepEqual(lastState, [0, 'complete']);
  assert.ok(rec.lcds.some((text) => text.includes(THANK_YOU_HINT)));

  director.stop();
});

test('reject() 在 needs_input 状态下同步转 error，并携带吐槽文案', async (t) => {
  t.mock.method(Math, 'random', () => 0);
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: 0.002 });
  director.start();

  await waitFor(() => rec.states.some(([slotId, state]) => slotId === 1 && state === 'needs_input'));

  director.reject(1);
  const lastState = rec.states.at(-1);
  assert.deepEqual(lastState, [1, 'error']);
  assert.ok(rec.lcds.some((text) => text.includes(COMPLAIN_HINT)));

  director.stop();
});

test('approve()/reject() 在非 needs_input 状态下是幂等无操作', () => {
  // random 恒为 0.99：resolveThinking 恒走 complete 分支，不会进入 needs_input。
  const restore = Math.random;
  Math.random = () => 0.99;
  try {
    const rec = makeRecorder();
    const director = createDemoDirector(rec, { timeScale: 1 });
    director.start(); // 此刻所有 slot 都是 idle，尚未进入 needs_input
    const beforeCount = rec.states.length;

    director.approve(0);
    director.reject(0);

    assert.equal(rec.states.length, beforeCount, 'idle 状态下 approve/reject 不应产生新的状态事件');
    director.stop();
  } finally {
    Math.random = restore;
  }
});

test('voicePrompt() 立即打断当前生活线并进入 thinking，LCD 显示派活任务', () => {
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: 1 });
  director.start();

  director.voicePrompt(2);

  const lastState = rec.states.filter(([slotId]) => slotId === 2).at(-1);
  assert.deepEqual(lastState, [2, 'thinking']);
  assert.ok(rec.lcds.at(-1).startsWith(VOICE_TASK_PREFIX));

  director.stop();
});

test('stop() 之后 voicePrompt()/focus() 均无操作', () => {
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: 1 });
  director.start();
  director.stop();

  const beforeStates = rec.states.length;
  const beforeFocuses = rec.focuses.length;

  director.voicePrompt(0);
  director.focus(3);

  assert.equal(rec.states.length, beforeStates);
  assert.equal(rec.focuses.length, beforeFocuses);
});

test('focus() 在运行中会同步调用 onFocus(slotId)', () => {
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: 1 });
  director.start();

  director.focus(4);

  assert.deepEqual(rec.focuses, [4]);
  director.stop();
});

test('stop() 之后不再有新的状态事件产生（即便原本很快会触发下一轮）', async (t) => {
  t.mock.method(Math, 'random', () => 0.99); // 走最快的 complete 循环分支
  const rec = makeRecorder();
  const director = createDemoDirector(rec, { timeScale: 0.002 });
  director.start();

  await sleep(20); // 让至少一轮 idle->thinking 发生
  director.stop();
  const countAfterStop = rec.states.length;

  await sleep(50); // 若未真正停止，这段时间内该产生更多事件
  assert.equal(rec.states.length, countAfterStop, 'stop() 后不应再有状态事件');
});
