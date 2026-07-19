import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectLive } from '../toy/live.js';

/**
 * connectLive() 依赖浏览器全局 WebSocket/location，Node 里没有，测试前手动注入假实现。
 * FakeWebSocket 只做到能驱动 connectLive 内部逻辑所需的最小接口：
 * readyState + send() 记录 + on{open,message,close,error} 回调钩子。
 */
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    FakeWebSocket.instances.push(this);
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
}
FakeWebSocket.instances = [];

function installGlobals() {
  FakeWebSocket.instances = [];
  const originalWebSocket = globalThis.WebSocket;
  const originalLocation = globalThis.location;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  globalThis.WebSocket = FakeWebSocket;
  globalThis.location = { protocol: 'https:', host: 'example.test' };

  // 拦截 setTimeout/clearTimeout：connectLive 的重连退避用它调度，我们不想真的等
  // 500ms/1000ms/2000ms……手动记录调用、按需触发，让重连逻辑可在毫秒级测完。
  const timers = [];
  let nextId = 1;
  globalThis.setTimeout = (fn, ms) => {
    const id = nextId++;
    timers.push({ id, fn, ms });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    const idx = timers.findIndex((t) => t.id === id);
    if (idx !== -1) timers.splice(idx, 1);
  };

  return {
    timers,
    restore() {
      globalThis.WebSocket = originalWebSocket;
      globalThis.location = originalLocation;
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    },
  };
}

function makeRecorder() {
  const states = [];
  const lcds = [];
  const connections = [];
  return {
    states,
    lcds,
    connections,
    onState: (slotId, state, label) => states.push([slotId, state, label]),
    onLcd: (text) => lcds.push(text),
    onConnection: (s) => connections.push(s),
  };
}

test('connectLive() 建连并 open 后：发出 connecting/connected + subscribe 帧', () => {
  const { restore } = installGlobals();
  try {
    const rec = makeRecorder();
    connectLive({ token: 'tok', ...rec });

    assert.equal(FakeWebSocket.instances.length, 1);
    const ws = FakeWebSocket.instances[0];
    assert.match(ws.url, /^wss:\/\/example\.test\/\?token=tok$/);
    assert.deepEqual(rec.connections, ['connecting']);

    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen();

    assert.deepEqual(rec.connections, ['connecting', 'connected']);
    assert.deepEqual(ws.sent, [JSON.stringify({ type: 'subscribe' })]);
  } finally {
    restore();
  }
});

test('sendCommand()：已连接时按 spec 构造 JSON（有/无 text 两种）', () => {
  const { restore } = installGlobals();
  try {
    const rec = makeRecorder();
    const api = connectLive({ token: 'tok', ...rec });
    const ws = FakeWebSocket.instances[0];
    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen();

    api.sendCommand('accept', 2);
    assert.deepEqual(JSON.parse(ws.sent.at(-1)), {
      type: 'command',
      payload: { action: 'accept', slotId: 2 },
    });

    api.sendCommand('branch', 3, 'hello world');
    assert.deepEqual(JSON.parse(ws.sent.at(-1)), {
      type: 'command',
      payload: { action: 'branch', slotId: 3, text: 'hello world' },
    });
  } finally {
    restore();
  }
});

test('sendCommand()：未连接时加入离线队列（不发送），LCD 报告排队条数', () => {
  const { restore } = installGlobals();
  try {
    const rec = makeRecorder();
    const api = connectLive({ token: 'tok', ...rec });
    const ws = FakeWebSocket.instances[0];
    // 尚未 onopen，readyState 仍是 CONNECTING

    api.sendCommand('quick', 0);
    assert.deepEqual(ws.sent, []);
    assert.equal(rec.lcds.at(-1), '离线，已排队 1 条，连上补发');

    api.sendCommand('accept', 1);
    assert.deepEqual(ws.sent, []);
    assert.equal(rec.lcds.at(-1), '离线，已排队 2 条，连上补发');
  } finally {
    restore();
  }
});

test('onopen 时按入队顺序补发离线队列，LCD 报告补发条数', (t) => {
  const now = 1_700_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const { restore } = installGlobals();
  try {
    const rec = makeRecorder();
    const api = connectLive({ token: 'tok', ...rec });
    const ws = FakeWebSocket.instances[0];

    api.sendCommand('accept', 0);
    api.sendCommand('reject', 1, 'because');

    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen(); // 触发 subscribe + flushQueue()

    assert.deepEqual(
      ws.sent.map((raw) => JSON.parse(raw)),
      [
        { type: 'subscribe' },
        { type: 'command', payload: { action: 'accept', slotId: 0 } },
        { type: 'command', payload: { action: 'reject', slotId: 1, text: 'because' } },
      ]
    );
    assert.ok(rec.lcds.includes('补发 2 条离线指令'));
  } finally {
    restore();
  }
});

test('flushQueue()：超过 60s 的排队指令过期丢弃，不误发；新旧混合时汇报"补发 N 条，丢弃 M 条"', (t) => {
  let now = 1_700_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const { restore } = installGlobals();
  try {
    const rec = makeRecorder();
    const api = connectLive({ token: 'tok', ...rec });
    const ws = FakeWebSocket.instances[0];

    api.sendCommand('accept', 0); // 排队时 ts = now（稍后会显得很老）
    now += 61_000; // 跨过 QUEUE_MAX_AGE_MS(60000ms)
    api.sendCommand('reject', 1); // 排队时 ts = now（新鲜）

    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen();

    // 只应补发新鲜的第二条，过期的第一条不应出现在发出去的帧里。
    const sentPayloads = ws.sent.map((raw) => JSON.parse(raw));
    assert.deepEqual(sentPayloads, [
      { type: 'subscribe' },
      { type: 'command', payload: { action: 'reject', slotId: 1 } },
    ]);
    assert.ok(rec.lcds.includes('补发 1 条离线指令，1 条已超时丢弃'));
  } finally {
    restore();
  }
});

test('onmessage：state 消息路由到 onState，未知 state 被丢弃', () => {
  const { restore } = installGlobals();
  try {
    const rec = makeRecorder();
    connectLive({ token: 'tok', ...rec });
    const ws = FakeWebSocket.instances[0];

    ws.onmessage({
      data: JSON.stringify({
        type: 'state',
        slots: [
          { slotId: 0, state: 'thinking' },
          { slotId: 1, state: 'bogus_state' }, // 不在 STATE_OK 集合内，应被忽略
          { slotId: 2, state: 'complete', label: 'agent-2' },
        ],
      }),
    });

    assert.deepEqual(rec.states, [
      [0, 'thinking', null],
      [2, 'complete', 'agent-2'],
    ]);
  } finally {
    restore();
  }
});

test('onmessage：log 消息路由到 onLcd，非法 JSON 静默忽略不抛错', () => {
  const { restore } = installGlobals();
  try {
    const rec = makeRecorder();
    connectLive({ token: 'tok', ...rec });
    const ws = FakeWebSocket.instances[0];

    ws.onmessage({ data: JSON.stringify({ type: 'log', message: '你好' }) });
    assert.deepEqual(rec.lcds, ['你好']);

    assert.doesNotThrow(() => ws.onmessage({ data: '{not valid json' }));
    assert.deepEqual(rec.lcds, ['你好'], '非法 JSON 不应产生新的 onLcd 调用');
  } finally {
    restore();
  }
});

test('onclose：断线回调 onConnection(disconnected) 并按指数退避调度重连（500ms 起，倍增）', () => {
  const { timers, restore } = installGlobals();
  try {
    const rec = makeRecorder();
    connectLive({ token: 'tok', ...rec });
    const ws1 = FakeWebSocket.instances[0];

    ws1.onclose();
    assert.ok(rec.connections.includes('disconnected'));
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 500); // 第一次退避 500 * 2^0

    // 手动触发被拦截的重连定时器，模拟时间流逝 —— 应该发起第二次连接。
    const pendingReconnect = timers.shift();
    pendingReconnect.fn();
    assert.equal(FakeWebSocket.instances.length, 2);

    const ws2 = FakeWebSocket.instances[1];
    ws2.onclose();
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 1000); // 第二次退避 500 * 2^1
  } finally {
    restore();
  }
});

test('close()：主动关闭后不再触发重连调度', () => {
  const { timers, restore } = installGlobals();
  try {
    const rec = makeRecorder();
    const api = connectLive({ token: 'tok', ...rec });
    const ws = FakeWebSocket.instances[0];
    ws.readyState = FakeWebSocket.OPEN;

    api.close();

    assert.equal(ws.readyState, FakeWebSocket.CLOSED);
    // 主动关闭场景下浏览器不会触发 onclose 之外的重连逻辑；即便触发，closed=true 应短路。
    ws.onclose();
    assert.equal(timers.length, 0, 'close() 之后 onclose 不应调度新的重连定时器');
  } finally {
    restore();
  }
});
