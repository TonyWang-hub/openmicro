/**
 * demo-script.js — Demo 剧本引擎（纯逻辑，禁止碰 DOM/window）
 *
 * 6 个 slot（0-5）各自跑一条独立"生活线"：
 *   idle → thinking(2-5s) → 30% needs_input / 70% complete(2s) → idle → thinking → …
 * needs_input 等待外部 approve()/reject()，20s 无人理会自动 complete。
 * voicePrompt(slotId) 打断当前生活线，立即进入 thinking。
 *
 * 所有状态变化只经回调外发（onState/onLcd/onFocus），引擎本身不持有任何
 * DOM/window 引用，方便在 Node（单测）和浏览器两端复用同一份逻辑。
 */

/** @typedef {'idle'|'thinking'|'complete'|'needs_input'|'error'} DemoState */

import { t } from './i18n.js';

const SLOT_COUNT = 6;

const INITIAL_DELAY_MIN_MS = 500;
const INITIAL_DELAY_MAX_MS = 4000;
const THINKING_MIN_MS = 2000;
const THINKING_MAX_MS = 5000;
const COMPLETE_MS = 2000;
const ERROR_MS = 1500;
const NEEDS_INPUT_TIMEOUT_MS = 20000;
const NEEDS_INPUT_PROBABILITY = 0.3;

// 四组 LCD 文案（needs_input 喊话 / 感谢 / 吐槽 / 语音派活任务名，各 en/zh 4 条，
// 见 i18n.js 的 demo.needsInputPrompts / demo.thankYouMessages /
// demo.complainMessages / demo.voiceTasks）。不缓存到模块顶层常量，每次现取
// 是为了让运行时切换语言（setLang）立刻生效。

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

const noop = () => {};

/**
 * @param {{ onState?: (slotId: number, state: DemoState) => void, onLcd?: (text: string) => void, onFocus?: (slotId: number) => void }} callbacks
 * @param {{ timeScale?: number }} [options]
 */
export function createDemoDirector({ onState = noop, onLcd = noop, onFocus = noop } = {}, { timeScale = 1 } = {}) {
  /** @type {{ status: DemoState, timer: ReturnType<typeof setTimeout> | null }[]} */
  let slots = [];
  let stopped = true;

  function scaledMs(ms) {
    return Math.max(0, ms * timeScale);
  }

  function clearSlotTimer(slotId) {
    const slot = slots[slotId];
    if (slot && slot.timer) {
      clearTimeout(slot.timer);
      slot.timer = null;
    }
  }

  function setSlotTimer(slotId, ms, fn) {
    clearSlotTimer(slotId);
    const slot = slots[slotId];
    if (!slot) return;
    slot.timer = setTimeout(() => {
      if (stopped) return;
      slot.timer = null;
      safeRun(slotId, fn);
    }, scaledMs(ms));
  }

  function safeRun(slotId, fn) {
    try {
      fn();
    } catch (_err) {
      handleSlotError(slotId);
    }
  }

  function setState(slotId, status) {
    const slot = slots[slotId];
    if (!slot) return;
    slot.status = status;
    onState(slotId, status);
  }

  function handleSlotError(slotId) {
    // 引擎主循环异常兜底：LCD 提示后自动重启该 slot 的生活线。
    try {
      onLcd(t('demo.engineRestart'));
    } catch (_err) {
      // onLcd 本身抛错也不应该拖垮引擎
    }
    clearSlotTimer(slotId);
    setState(slotId, 'idle');
    scheduleInitialStart(slotId);
  }

  function scheduleInitialStart(slotId) {
    const delay = randomRange(INITIAL_DELAY_MIN_MS, INITIAL_DELAY_MAX_MS);
    setSlotTimer(slotId, delay, () => beginThinking(slotId));
  }

  function beginThinking(slotId) {
    setState(slotId, 'thinking');
    const duration = randomRange(THINKING_MIN_MS, THINKING_MAX_MS);
    setSlotTimer(slotId, duration, () => resolveThinking(slotId));
  }

  function resolveThinking(slotId) {
    if (Math.random() < NEEDS_INPUT_PROBABILITY) {
      enterNeedsInput(slotId);
    } else {
      enterComplete(slotId);
    }
  }

  function enterNeedsInput(slotId) {
    setState(slotId, 'needs_input');
    onLcd(pick(t('demo.needsInputPrompts')));
    setSlotTimer(slotId, NEEDS_INPUT_TIMEOUT_MS, () => {
      // 20s 无人理会：玩具不惩罚不理睬，自动 complete。
      enterComplete(slotId);
    });
  }

  function enterComplete(slotId, { thank = false } = {}) {
    setState(slotId, 'complete');
    if (thank) onLcd(pick(t('demo.thankYouMessages')));
    setSlotTimer(slotId, COMPLETE_MS, () => backToIdle(slotId));
  }

  function enterError(slotId) {
    setState(slotId, 'error');
    onLcd(pick(t('demo.complainMessages')));
    setSlotTimer(slotId, ERROR_MS, () => backToIdle(slotId));
  }

  function backToIdle(slotId) {
    setState(slotId, 'idle');
    // idle 不额外停留，立即继续下一轮生活线；用 timer(0) 保持异步、可被 stop() 打断。
    setSlotTimer(slotId, 0, () => beginThinking(slotId));
  }

  function start() {
    stop();
    stopped = false;
    slots = Array.from({ length: SLOT_COUNT }, () => ({ status: 'idle', timer: null }));
    for (let slotId = 0; slotId < SLOT_COUNT; slotId += 1) {
      setState(slotId, 'idle');
      scheduleInitialStart(slotId);
    }
  }

  function stop() {
    stopped = true;
    for (let slotId = 0; slotId < slots.length; slotId += 1) {
      clearSlotTimer(slotId);
    }
  }

  function approve(slotId) {
    if (stopped) return;
    const slot = slots[slotId];
    if (!slot || slot.status !== 'needs_input') return; // 非 needs_input 状态：幂等无操作
    safeRun(slotId, () => enterComplete(slotId, { thank: true }));
  }

  function reject(slotId) {
    if (stopped) return;
    const slot = slots[slotId];
    if (!slot || slot.status !== 'needs_input') return; // 非 needs_input 状态：幂等无操作
    safeRun(slotId, () => enterError(slotId));
  }

  function voicePrompt(slotId) {
    if (stopped) return;
    const slot = slots[slotId];
    if (!slot) return;
    safeRun(slotId, () => {
      setState(slotId, 'thinking');
      onLcd(t('demo.voicePrefix', { task: pick(t('demo.voiceTasks')) }));
      const duration = randomRange(THINKING_MIN_MS, THINKING_MAX_MS);
      setSlotTimer(slotId, duration, () => resolveThinking(slotId));
    });
  }

  function focus(slotId) {
    if (stopped) return;
    onFocus(slotId);
  }

  return { start, stop, approve, reject, voicePrompt, focus };
}
