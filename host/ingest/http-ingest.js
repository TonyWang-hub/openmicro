import { mapClaudeHook } from '../adapters/claude-code.js';
import {
  mapCodexHook,
  mapCodexLegacyNotify,
  mapCodexAppServerStatus,
} from '../adapters/codex.js';

/** @typedef {'claude-code'|'codex'} AgentKind */
/** @typedef {'hooks'|'notify-legacy'|'app-server'} IngestChannel */

/**
 * @typedef {object} SlotBinding
 * @property {number} slotId
 * @property {AgentKind} agent
 * @property {string} sessionKey
 */

/**
 * @typedef {object} IngestBody
 * @property {AgentKind} agent
 * @property {IngestChannel} channel
 * @property {string} sessionKey
 * @property {Record<string, unknown>} payload
 */

const VALID_AGENTS = new Set(['claude-code', 'codex']);
const VALID_CHANNELS = new Set(['hooks', 'notify-legacy', 'app-server']);

/**
 * @param {{ codexAppServerEnabled?: boolean }} [options]
 * @returns {(agent: AgentKind, channel: IngestChannel, payload: Record<string, unknown>, binding: SlotBinding) => import('../types.js').AgentLightEvent | null}
 */
export function createAdapterMapRaw({ codexAppServerEnabled = false } = {}) {
  return (agent, channel, payload, binding) => {
    if (channel === 'app-server') {
      if (!codexAppServerEnabled || agent !== 'codex') return null;
      return mapCodexAppServerStatus(payload, binding);
    }
    if (channel === 'notify-legacy') {
      if (agent !== 'codex') return null;
      return mapCodexLegacyNotify(payload, binding);
    }
    if (channel === 'hooks') {
      if (agent === 'claude-code') return mapClaudeHook(payload, binding);
      if (agent === 'codex') return mapCodexHook(payload, binding);
    }
    return null;
  };
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<unknown>}
 */
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) {
    throw new Error('empty body');
  }
  return JSON.parse(text);
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, value: IngestBody } | { ok: false, error: string }}
 */
function parseIngestBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be a JSON object' };
  }

  const { agent, channel, sessionKey, payload, label, tmuxTarget } =
    /** @type {Record<string, unknown>} */ (body);

  if (!VALID_AGENTS.has(/** @type {string} */ (agent))) {
    return { ok: false, error: 'invalid agent' };
  }
  if (!VALID_CHANNELS.has(/** @type {string} */ (channel))) {
    return { ok: false, error: 'invalid channel' };
  }
  if (typeof sessionKey !== 'string' || !sessionKey) {
    return { ok: false, error: 'sessionKey required' };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'payload must be an object' };
  }

  return {
    ok: true,
    value: {
      agent: /** @type {AgentKind} */ (agent),
      channel: /** @type {IngestChannel} */ (channel),
      sessionKey,
      label: typeof label === 'string' ? label : null,
      tmuxTarget: typeof tmuxTarget === 'string' && tmuxTarget ? tmuxTarget : null,
      payload: /** @type {Record<string, unknown>} */ (payload),
    },
  };
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {{ ok: boolean, error?: string }} body
 */
function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * @typedef {object} IngestHandlerOptions
 * @property {ReturnType<import('../state/agent-state-store.js').createStore>} store
 * @property {(agent: AgentKind, channel: IngestChannel, payload: Record<string, unknown>, binding: SlotBinding) => import('../types.js').AgentLightEvent | null} [mapRaw]
 */

/**
 * @param {IngestHandlerOptions} options
 */
export function createIngestHandler({ store, mapRaw = createAdapterMapRaw() }) {
  return async function handleIngest(req, res) {
    const pathname = req.url?.split('?')[0];
    if (req.method !== 'POST' || pathname !== '/ingest/hook') {
      res.writeHead(404);
      res.end();
      return;
    }

    let rawBody;
    try {
      rawBody = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid JSON body' });
      return;
    }

    const parsed = parseIngestBody(rawBody);
    if (!parsed.ok) {
      sendJson(res, 400, { ok: false, error: parsed.error });
      return;
    }

    const { agent, channel, sessionKey, label, tmuxTarget, payload } = parsed.value;
    // Auto-assign a slot for this live session (session_id). No "unknown
    // sessionKey" rejection: any session that reaches here claims/keeps a slot.
    const slotId = store.resolveSession({ sessionKey, agent, label, tmuxTarget });
    const binding = { slotId, agent, sessionKey };

    const event = mapRaw(agent, channel, payload, binding);
    if (!event) {
      sendJson(res, 200, { ok: true });
      return;
    }

    const result = store.applyEvent(event);
    if (!result.ok) {
      sendJson(res, 400, { ok: false, error: result.reason ?? 'apply failed' });
      return;
    }

    sendJson(res, 200, { ok: true });
  };
}
