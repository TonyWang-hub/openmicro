import path from 'node:path';
import os from 'node:os';

/** Default per-agent accept/reject key sequences (best-effort, real-device calibration pending). */
const DEFAULT_KEYMAP = Object.freeze({
  'claude-code': { accept: ['1'], reject: ['Escape'] },
  codex: { accept: ['y', 'Enter'], reject: ['n', 'Enter'] },
});

/**
 * Deep-merge a partial keymap override onto the default keymap.
 * Only merges plain objects one level deep (per-agent -> accept/reject);
 * arrays and other values are replaced wholesale, not concatenated.
 * @param {Record<string, {accept?: string[], reject?: string[]}>} base
 * @param {Record<string, {accept?: string[], reject?: string[]}>} override
 */
function mergeKeymap(base, override) {
  const merged = {};
  for (const agent of new Set([...Object.keys(base), ...Object.keys(override)])) {
    merged[agent] = { ...base[agent], ...override[agent] };
  }
  return merged;
}

/**
 * Parse CMS_KEYMAP (JSON string) and deep-merge it onto the default keymap.
 * Falls back to the default keymap (with a console.warn) if parsing fails
 * or the parsed value isn't a plain object.
 * @param {string | undefined} raw
 */
function resolveKeymap(raw) {
  if (!raw) return { ...DEFAULT_KEYMAP };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('[cms] CMS_KEYMAP is not valid JSON, using defaults:', err instanceof Error ? err.message : err);
    return { ...DEFAULT_KEYMAP };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.warn('[cms] CMS_KEYMAP must be a JSON object, using defaults');
    return { ...DEFAULT_KEYMAP };
  }
  return mergeKeymap(DEFAULT_KEYMAP, parsed);
}

export function loadConfig(env = process.env) {
  return {
    /** Bind address; default loopback-only. Override with CMS_HOST (e.g. 0.0.0.0). */
    host: env.CMS_HOST || '127.0.0.1',
    port: Number(env.CMS_PORT || 7788),
    completeHoldMs: Number(env.CMS_COMPLETE_HOLD_MS || 2000),
    ingestStaleMs: Number(env.CMS_INGEST_STALE_MS || 30_000),
    codexAppServerEnabled: env.CMS_CODEX_APP_SERVER === '1',
    defaultCwd: env.CMS_DEFAULT_CWD || process.cwd(),
    dataDir: env.CMS_DATA_DIR || path.join(os.homedir(), '.cms'),
    /** Live-mode pairing token; empty means Host generates a random one at boot. */
    token: env.CMS_TOKEN || null,
    keymap: resolveKeymap(env.CMS_KEYMAP),
    commands: {
      'claude-code': env.CMS_CMD_CLAUDE || 'claude',
      codex: env.CMS_CMD_CODEX || 'codex',
    },
    slots: [
      { slotId: 0, agent: 'claude-code', sessionKey: 'cms-claude-0' },
      { slotId: 1, agent: 'codex', sessionKey: 'cms-codex-1' },
    ],
  };
}
