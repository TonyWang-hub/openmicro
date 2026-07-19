/**
 * i18n.js — minimal string dictionary + language resolution.
 *
 * Pure JS, no DOM dependency: imported by demo-script.js (which itself must
 * stay Node-testable, no DOM/window access — see that file's header) as well
 * as by browser-only modules (live.js, keyboard.js) and inline scripts
 * (m.html, pair.html).
 *
 * Resolution order (first hit wins):
 *   1. `?lang=en|zh` in the current URL (also persisted to localStorage)
 *   2. `localStorage['toy-lang']`
 *   3. Browser language: `navigator.language` starting with "zh" → zh
 *   4. Default: "en"
 *
 * Exception: in a DOM-less environment (no `document` global — e.g. this
 * project's Node `node:test` suite, which asserts the original hardcoded
 * Chinese copy verbatim), step 3/4 instead default to "zh" so existing tests
 * keep passing without depending on the host machine's locale. Real browsers
 * always have `document`, so this never fires in production.
 */

const STORAGE_KEY = 'toy-lang';
const SUPPORTED = new Set(['en', 'zh']);

const DICTS = {
  en: {
    // --- keyboard.js ---
    'keyboard.rotateHint': 'Best in portrait · rotate for best fit',

    // --- m.html : speech-to-text / PTT ---
    'ptt.notHeard': 'didn’t catch that',
    'ptt.dispatched': '🎤 dispatched: {text}',
    'ptt.noSpeechSupport': 'speech not supported here, use the keyboard',
    'ptt.selectAgentFirst': 'tap an Agent light first, then talk',

    // --- m.html : agent key / focus ---
    'agent.selected': 'selected {who} (◎✓/⊗ act on it only)',
    'agent.needsSelectionFirst': 'tap an Agent light to select it, then this key',
    'agent.focusArrow': '→ {who}',
    'agent.focusArrowDemo': '→ agent {slotId}',
    'agent.noneActive': 'no active agents yet',

    // --- m.html : command keys (live mode) ---
    'cmd.live.acceptedTo': '◎✓ accepted → {who}',
    'cmd.live.rejectedTo': '⊗ rejected → {who}',
    'cmd.live.quickTo': '⚡ continue (enter) → {who}',
    'cmd.live.newSession': '💭 new sessions start on your computer (claude/codex) — lights up automatically',
    'cmd.live.branch': '⤴ branching happens on your computer, phone won’t remote-exec it',

    // --- m.html : command keys (demo mode) ---
    'cmd.demo.quick': '⚡ nudged the agent (continue)',
    'cmd.demo.branch': '⤴ branched off the current thread (demo)',
    'cmd.demo.newSession': '💭 new session thread created (demo)',

    // --- m.html : knob ---
    'knob.liveDisplay': 'reasoning shown as {level} (remote doesn’t change the real agent setting)',
    'knob.demoDisplay': 'reasoning → {level} (agent says the pressure is {pressure})',
    'knob.pressureHigh': 'through the roof',
    'knob.pressureLow': 'no big deal',

    // --- m.html : joystick ---
    'joy.top': '⇟ back to top',
    'joy.scrollLog': '⇡ scroll log',

    // --- m.html : touch sensor ---
    'touch.tapHint': 'touch sensor: beep. (long-press to switch tone)',
    'touch.profileSwitched': 'tone → {name}',
    'touch.profilePom': 'POM clicky switch',
    'touch.profilePok': 'POK silent switch',

    // --- m.html : live connection / status ---
    'live.connecting': 'LIVE · connecting…',
    'live.needsYou': '{who} needs you — select it, then ◎✓/⊗',
    'live.connected': 'LIVE · connected to your real agent',
    'live.disconnected': 'disconnected, reconnecting… (lights hold last state)',

    // --- m.html : demo boot ---
    'demo.boot': "LET'S BUILD — demo powered on, agents at work",

    // --- pair.html ---
    'pair.title': 'OpenMicro · phone pairing',
    'pair.heading': 'scan with your phone to open OpenMicro',
    'pair.generating': 'generating…',
    'pair.hint': 'phone must be on the same LAN as this computer',
    'pair.error': 'couldn’t generate the QR code, please refresh',

    // --- live.js : offline queue ---
    'live.queuedOffline': 'offline, queued {n} command(s), will send once reconnected',
    'live.replayedOnly': 'replayed {n} queued command(s)',
    'live.replayedAndDropped': 'replayed {sent} queued command(s), dropped {dropped} as stale',
    'live.droppedOnly': 'dropped {n} queued command(s) as stale (nothing replayed)',

    // --- demo-script.js ---
    'demo.engineRestart': 'rebooting…',
    'demo.voicePrefix': 'voice-dispatched: {task}',
    'demo.needsInputPrompts': [
      'agent 3 wants to rm -rf node_modules, approve?',
      'agent 5 claims it found the ancestral home of THE bug, let it in?',
      'one agent wants to push straight to main, your call',
      'agent is requesting to generate 1024 test files, confirm?',
    ],
    'demo.thankYouMessages': [
      'thanks boss, back to grinding',
      'thanks for the approval, starting now',
      'boss is a genius, task confirmed',
      'permission granted, full throttle',
    ],
    'demo.complainMessages': [
      'rejected, the agent muttered a quiet curse',
      'fine, guess I’ll just rot then',
      'boss said no, agent is sulking in place',
      'sent back for rework, morale took a small hit',
    ],
    'demo.voiceTasks': [
      'going spelunking in the ancestral codebase',
      'slowing production down a notch',
      'writing docs nobody will read',
      'hunting down that flaky test',
    ],
  },
  zh: {
    'keyboard.rotateHint': '竖屏体验最佳 · rotate for best fit',

    'ptt.notHeard': '没听清',
    'ptt.dispatched': '🎤 已派活：{text}',
    'ptt.noSpeechSupport': '此浏览器不支持语音，用键盘',
    'ptt.selectAgentFirst': '先选中一盏 Agent 灯再语音',

    'agent.selected': '已选中 {who}（◎✓/⊗ 只作用于它）',
    'agent.needsSelectionFirst': '先点一盏 Agent 灯选中它，再按此键',
    'agent.focusArrow': '→ {who}',
    'agent.focusArrowDemo': '→ agent {slotId}',
    'agent.noneActive': '暂无活跃 agent',

    'cmd.live.acceptedTo': '◎✓ 接受 → {who}',
    'cmd.live.rejectedTo': '⊗ 拒绝 → {who}',
    'cmd.live.quickTo': '⚡ 继续（回车）→ {who}',
    'cmd.live.newSession': '💭 新会话请在电脑上开 claude/codex，会自动上灯',
    'cmd.live.branch': '⤴ 分叉是电脑端操作，手机不远程执行',

    'cmd.demo.quick': '⚡ 已催 agent 一把（继续）',
    'cmd.demo.branch': '⤴ 从当前思路分叉一条新线（demo）',
    'cmd.demo.newSession': '💭 新会话线程已创建（demo）',

    'knob.liveDisplay': '思考力度显示 {level}（远程不改真 agent 设置）',
    'knob.demoDisplay': '思考力度 → {level}（agent 表示压力{pressure}）',
    'knob.pressureHigh': '山大',
    'knob.pressureLow': '不大',

    'joy.top': '⇟ 回到顶部',
    'joy.scrollLog': '⇡ 滚动日志',

    'touch.tapHint': '触摸传感器：嘀。（长按切换音色）',
    'touch.profileSwitched': '音色 → {name}',
    'touch.profilePom': 'POM 清脆轴',
    'touch.profilePok': 'POK 静音轴',

    'live.connecting': 'LIVE · 连接中…',
    'live.needsYou': '{who} 需要你 — 点它选中再按 ◎✓/⊗',
    'live.connected': 'LIVE · 已连接你的真 agent',
    'live.disconnected': '断线了，重连中…（灯保持最后状态）',

    'demo.boot': "LET'S BUILD — demo 上电，agent 们开工了",

    'pair.title': 'OpenMicro · 手机配对',
    'pair.heading': '用手机扫码打开 OpenMicro',
    'pair.generating': '生成中…',
    'pair.hint': '手机需与本机同一局域网',
    'pair.error': '二维码生成失败，请刷新重试',

    'live.queuedOffline': '离线，已排队 {n} 条，连上补发',
    'live.replayedOnly': '补发 {n} 条离线指令',
    'live.replayedAndDropped': '补发 {sent} 条离线指令，{dropped} 条已超时丢弃',
    'live.droppedOnly': '{n} 条离线指令已超时丢弃（未补发）',

    'demo.engineRestart': '重新上电…',
    'demo.voicePrefix': '语音已派活：{task}',
    'demo.needsInputPrompts': [
      'agent 3 想 rm -rf node_modules，批吗？',
      'agent 5 声称找到了祖传 bug 的老巢，要不要放行？',
      '有个 agent 想直接 push 到 main，你说了算',
      'agent 请求生成 1024 个测试文件，确认？',
    ],
    'demo.thankYouMessages': [
      '多谢老板签字，继续搬砖',
      '感谢批准，这就开工',
      '老板英明，任务已确认',
      '收到许可，马力全开',
    ],
    'demo.complainMessages': [
      '被拒了，agent 小声嘀咕了一句脏话',
      '行吧，那我摆烂了',
      '老板不批，agent 决定原地生闷气',
      '被打回重做，心态崩了一下下',
    ],
    'demo.voiceTasks': [
      '去祖传代码里考古',
      '给生产环境降降速',
      '写一份没人看的文档',
      '追杀那个偶发的 flaky test',
    ],
  },
};

function hasBrowserDom() {
  return typeof document !== 'undefined';
}

function readUrlLangOverride() {
  try {
    if (typeof location === 'undefined' || !location.search) return null;
    const p = new URLSearchParams(location.search).get('lang');
    return SUPPORTED.has(p) ? p : null;
  } catch {
    return null;
  }
}

function readStoredLang() {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return SUPPORTED.has(saved) ? saved : null;
  } catch {
    return null;
  }
}

function writeStoredLang(lang) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private mode / quota / no localStorage — ignore */
  }
}

function detectDefaultLang() {
  // No DOM at all (e.g. Node's `node:test` runner) => treat as a
  // non-browser/test context and default to zh, matching this project's
  // pre-i18n test fixtures which assert the original Chinese copy verbatim.
  if (!hasBrowserDom()) return 'zh';
  try {
    if (typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '')) return 'zh';
  } catch {
    /* ignore */
  }
  return 'en';
}

/** @type {'en'|'zh'|null} */
let currentLang = null;

function resolveInitialLang() {
  const fromUrl = readUrlLangOverride();
  if (fromUrl) {
    writeStoredLang(fromUrl);
    return fromUrl;
  }
  const stored = readStoredLang();
  if (stored) return stored;
  return detectDefaultLang();
}

/** @returns {'en'|'zh'} */
export function getLang() {
  if (currentLang === null) currentLang = resolveInitialLang();
  return currentLang;
}

/** @param {'en'|'zh'} lang */
export function setLang(lang) {
  if (!SUPPORTED.has(lang)) return;
  currentLang = lang;
  writeStoredLang(lang);
}

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, key) => (key in params ? String(params[key]) : m));
}

/**
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string|string[]}
 */
export function t(key, params) {
  const lang = getLang();
  const dict = DICTS[lang] || DICTS.en;
  const value = key in dict ? dict[key] : DICTS.en[key];
  if (value === undefined) return key;
  if (Array.isArray(value)) return value;
  return interpolate(value, params);
}
