import { execFile } from 'node:child_process';

/**
 * Named keys that cmux `send-key` understands. Anything else that is a single
 * printable character must go through `send` as text — cmux `send-key` rejects
 * bare digits/letters ("Unknown key"), verified 2026-07-18.
 */
const NAMED_KEYS = new Set([
  'escape', 'enter', 'tab', 'backspace', 'delete', 'space',
  'up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown',
]);

/**
 * Classify one keymap token into the cmux subcommand + argument that delivers
 * it. `Escape`/`Enter`/… → send-key <lowercased>; a single printable char
 * (`1`, `y`, …) → send <char>.
 * @param {string} token
 * @returns {{ sub: 'send' | 'send-key', arg: string } | null}
 */
export function classifyKey(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  const lower = token.toLowerCase();
  if (NAMED_KEYS.has(lower)) return { sub: 'send-key', arg: lower };
  // Single printable ASCII char → send as text.
  if ([...token].length === 1 && /[\x21-\x7e ]/.test(token)) {
    return { sub: 'send', arg: token };
  }
  // Unknown multi-char token: best-effort as a named key (lowercased).
  return { sub: 'send-key', arg: lower };
}

/**
 * @param {string[]} argv
 * @returns {Promise<{ stdout: string, stderr: string, code: number }>}
 */
function defaultRun(argv) {
  const [cmd, ...args] = argv;
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err && err.code === undefined) {
        reject(err); // spawn failure (binary missing) — surfaces as a thrown error
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr), code: err?.code ?? 0 });
    });
  });
}

/**
 * cmux injection client. Delivers keystrokes into a specific cmux terminal
 * surface (identified by its stable UUID, which the forwarder reads from the
 * agent process's $CMUX_PANEL_ID). NEVER targets a surface the caller names
 * out of band — only the session's own reported surface.
 * @param {{ bin: string, run?: typeof defaultRun }} options
 */
export function createCmuxClient({ bin, run = defaultRun }) {
  return {
    /**
     * @param {string} surfaceRef surface UUID (or ref)
     * @param {string[]} keys keymap tokens in order
     */
    async sendKeys(surfaceRef, keys) {
      for (const token of keys) {
        const k = classifyKey(token);
        if (!k) continue;
        const argv = k.sub === 'send'
          ? [bin, 'send', '--surface', surfaceRef, '--', k.arg]
          : [bin, 'send-key', '--surface', surfaceRef, '--', k.arg];
        const result = await run(argv);
        if (result.code !== 0) {
          throw new Error(`cmux ${k.sub} failed (surface ${surfaceRef}): ${result.stderr.trim() || result.code}`);
        }
      }
    },

    /**
     * Type an arbitrary text string into a surface, then press Enter. Used by
     * `prompt` (voice dispatch) — the whole utterance goes as one `send`, not
     * per-key (send-key rejects multi-char), then a send-key enter submits it.
     * @param {string} surfaceRef
     * @param {string} text
     */
    async sendText(surfaceRef, text) {
      const send = await run([bin, 'send', '--surface', surfaceRef, '--', text]);
      if (send.code !== 0) {
        throw new Error(`cmux send text failed (surface ${surfaceRef}): ${send.stderr.trim() || send.code}`);
      }
      const enter = await run([bin, 'send-key', '--surface', surfaceRef, '--', 'enter']);
      if (enter.code !== 0) {
        throw new Error(`cmux send-key enter failed (surface ${surfaceRef}): ${enter.stderr.trim() || enter.code}`);
      }
    },

    /**
     * Spawn a new cmux workspace running an agent command in the given dir —
     * this is how `new_session` / `branch` open a fresh Claude/Codex remotely.
     * The new session then auto-registers a light via its own hooks.
     * @param {{ cwd: string, command: string, name?: string }} opts
     */
    async createSession({ cwd, command, name = 'cms-new' }) {
      const argv = [bin, 'workspace', 'create', '--name', name, '--cwd', cwd, '--command', command];
      const result = await run(argv);
      if (result.code !== 0) {
        throw new Error(`cmux workspace create failed: ${result.stderr.trim() || result.code}`);
      }
    },
  };
}
