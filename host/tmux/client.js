import { spawn } from 'node:child_process';

export class TmuxNotFoundError extends Error {
  constructor(message = 'tmux not found') {
    super(message);
    this.name = 'TmuxNotFoundError';
  }
}

/**
 * @param {string[]} argv
 * @returns {Promise<{ stdout: string, stderr: string, code: number }>}
 */
function defaultRun(argv) {
  const [cmd, ...args] = argv;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

/**
 * @param {{ run?: typeof defaultRun }} [options]
 */
export function createTmuxClient({ run = defaultRun } = {}) {
  async function ensureTmux() {
    const result = await run(['which', 'tmux']);
    if (result.code !== 0 || !result.stdout.trim()) {
      throw new TmuxNotFoundError();
    }
  }

  async function sessionExists(name) {
    const result = await run(['tmux', 'has-session', '-t', name]);
    return result.code === 0;
  }

  async function newSession({ name, cwd, command }) {
    const argv = ['tmux', 'new-session', '-d', '-s', name, '-c', cwd];
    if (command) argv.push(command);
    const result = await run(argv);
    if (result.code !== 0) {
      throw new Error(`tmux new-session failed: ${result.stderr.trim()}`);
    }
  }

  async function sendKeys(name, keys) {
    for (const key of keys) {
      const argv = key === 'Enter'
        ? ['tmux', 'send-keys', '-t', name, 'Enter']
        : ['tmux', 'send-keys', '-t', name, '--', key];
      const result = await run(argv);
      if (result.code !== 0) {
        throw new Error(`tmux send-keys failed for key "${key}": ${result.stderr.trim()}`);
      }
    }
  }

  async function killSession(name) {
    const result = await run(['tmux', 'kill-session', '-t', name]);
    if (result.code !== 0) {
      throw new Error(`tmux kill-session failed: ${result.stderr.trim()}`);
    }
  }

  return {
    ensureTmux,
    sessionExists,
    newSession,
    sendKeys,
    killSession,
  };
}

const defaultClient = createTmuxClient();
export const {
  ensureTmux,
  sessionExists,
  newSession,
  sendKeys,
  killSession,
} = defaultClient;
