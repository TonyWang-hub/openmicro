import pty from 'node-pty';

/** @type {typeof pty.spawn} */
const defaultSpawn = pty.spawn.bind(pty);

/**
 * @param {{
 *   sessionKey: string,
 *   onData?: (data: string) => void,
 *   onExit?: (code: number, signal?: string) => void,
 *   spawn?: typeof defaultSpawn,
 * }} options
 */
export function createPtySession({ sessionKey, onData, onExit, spawn = defaultSpawn }) {
  const ptyProcess = spawn('tmux', ['attach', '-t', sessionKey], {
    name: 'xterm-256color',
  });

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
