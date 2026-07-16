import path from 'node:path';
import os from 'node:os';

export function loadConfig(env = process.env) {
  return {
    port: Number(env.CMS_PORT || 7788),
    completeHoldMs: Number(env.CMS_COMPLETE_HOLD_MS || 2000),
    ingestStaleMs: Number(env.CMS_INGEST_STALE_MS || 30_000),
    codexAppServerEnabled: env.CMS_CODEX_APP_SERVER === '1',
    defaultCwd: env.CMS_DEFAULT_CWD || process.cwd(),
    dataDir: env.CMS_DATA_DIR || path.join(os.homedir(), '.cms'),
    keymap: {
      'claude-code': { accept: ['y', 'Enter'], reject: ['n', 'Enter'] },
      codex: { accept: ['y', 'Enter'], reject: ['n', 'Enter'] },
    },
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
