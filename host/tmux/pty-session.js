import { execFileSync } from 'node:child_process';
import pty from 'node-pty';

/** @type {typeof pty.spawn} */
const defaultSpawn = pty.spawn.bind(pty);

/** Resolve absolute tmux path so PTY spawn does not depend on lean PATH. */
export function resolveTmuxBin() {
  try {
    const bin = execFileSync('which', ['tmux'], { encoding: 'utf8' }).trim();
    return bin || 'tmux';
  } catch {
    return 'tmux';
  }
}

/**
 * @param {{
 *   sessionKey: string,
 *   onData?: (data: string) => void,
 *   onExit?: (code: number, signal?: string) => void,
 *   spawn?: typeof defaultSpawn,
 *   tmuxBin?: string,
 * }} options
 */
export function createPtySession({
  sessionKey,
  onData,
  onExit,
  spawn = defaultSpawn,
  tmuxBin = resolveTmuxBin(),
}) {
  let ptyProcess;
  try {
    ptyProcess = spawn(tmuxBin, ['attach', '-t', sessionKey], {
      name: 'xterm-256color',
      cwd: process.env.HOME || process.cwd(),
      env: process.env,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/posix_spawnp/i.test(msg)) {
      throw new Error(
        `${msg} (often node-pty spawn-helper not executable — run: npm run postinstall)`,
      );
    }
    throw err;
  }

  ptyProcess.on('data', (data) => {
    onData?.(data);
  });

  ptyProcess.on('exit', (code, signal) => {
    onExit?.(code, signal);
  });

  return {
    write(data) {
      ptyProcess.write(data);
    },
    resize(cols, rows) {
      ptyProcess.resize(cols, rows);
    },
    dispose() {
      ptyProcess.kill();
    },
  };
}
