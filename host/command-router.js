import { MAX_SLOTS } from './types.js';

/**
 * @typedef {import('./types.js').CommandRequest} CommandRequest
 * @typedef {import('./types.js').AgentKind} AgentKind
 */

/**
 * @typedef {object} TmuxLike
 * @property {(name: string) => Promise<boolean>} sessionExists
 * @property {(opts: { name: string, cwd: string, command?: string }) => Promise<void>} newSession
 * @property {(name: string, keys: string[]) => Promise<void>} sendKeys
 */

/**
 * @typedef {object} CommandRouterOptions
 * @property {ReturnType<import('./state/agent-state-store.js').createStore>} store
 * @property {TmuxLike} tmux
 * @property {{ sendKeys: (surfaceRef: string, keys: string[]) => Promise<void> }} [cmux]
 * @property {Record<string, { accept: string[], reject: string[] }>} keymap
 * @property {Record<string, string>} commands
 * @property {string} defaultCwd
 * @property {number} [maxSlots]
 * @property {(slotId: number, sessionKey: string) => void} attachPty
 * @property {(msg: { type: string, [k: string]: unknown }) => void} emit
 */

/**
 * @param {CommandRouterOptions} options
 */
export function createCommandRouter({
  store,
  tmux,
  cmux = null,
  keymap,
  commands,
  defaultCwd,
  maxSlots = MAX_SLOTS,
  attachPty,
  emit,
}) {
  /** @type {number | null} */
  let focusedSlotId = null;

  /**
   * @param {string} message
   * @param {string} [level]
   */
  function fail(message, level = 'error') {
    emit({ type: 'error', message });
    emit({ type: 'log', level, message });
  }

  /**
   * @param {number} slotId
   */
  function findSlot(slotId) {
    return store.snapshot().find((s) => s.slotId === slotId) ?? null;
  }

  /**
   * @param {CommandRequest} request
   */
  async function handleAcceptReject(request) {
    const slot = findSlot(request.slotId);
    if (!slot) {
      fail(`slot ${request.slotId} not bound`);
      return;
    }
    // `quick` = a "press Enter to continue" nudge — a fixed key, not a
    // per-agent keymap entry.
    const keys = request.action === 'quick'
      ? ['Enter']
      : keymap[slot.agent]?.[request.action];
    if (!keys?.length) {
      fail(`no keymap for ${slot.agent}.${request.action}`);
      return;
    }
    // Injection target comes from what the session's own forwarder reported —
    // NOT the sessionKey (a session_id UUID). Prefer cmux (the user's actual
    // multiplexer; that's where the TUI lives), then tmux. A session in neither
    // has no surface/pane to inject into — an LCD hint, not a hard error
    // (monitoring still works; only remote keys can't). Only ever the session's
    // OWN reported surface is targeted.
    try {
      if (slot.cmuxTarget && cmux) {
        await cmux.sendKeys(slot.cmuxTarget, keys);
        emit({ type: 'log', level: 'info', message: `${request.action} → cmux ${slot.cmuxTarget}` });
      } else if (slot.tmuxTarget) {
        await tmux.sendKeys(slot.tmuxTarget, keys);
        emit({ type: 'log', level: 'info', message: `${request.action} → tmux ${slot.tmuxTarget}` });
      } else {
        emit({ type: 'log', level: 'info', message: `${slot.label ?? 'session'} 不在 tmux/cmux，无法远程按键` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A "not found" / "no such" from the multiplexer means the session's
      // surface/pane is gone (terminal closed). Drop the dead slot instead of
      // surfacing a raw "cmux send failed" that reads as an app error.
      if (/not.?found|no such|unknown (?:surface|pane|session)/i.test(message)) {
        store.dropSlot?.(request.slotId);
        emit({ type: 'log', level: 'info', message: `${slot.label ?? '会话'} 已关闭，已从灯位移除` });
      } else {
        fail(message);
      }
    }
  }

  /**
   * Voice-dispatch: type the spoken `text` into the focused session's terminal
   * and submit it (Enter). Same target resolution + dead-slot cleanup as accept.
   * @param {CommandRequest & { text?: string }} request
   */
  async function handlePrompt(request) {
    const slot = findSlot(request.slotId);
    if (!slot) {
      fail(`slot ${request.slotId} not bound`);
      return;
    }
    const text = typeof request.text === 'string' ? request.text.trim() : '';
    if (!text) {
      emit({ type: 'log', level: 'info', message: '语音为空，未派活' });
      return;
    }
    try {
      if (slot.cmuxTarget && cmux) {
        await cmux.sendText(slot.cmuxTarget, text);
        emit({ type: 'log', level: 'info', message: `🎙 派活 → ${slot.label ?? 'cmux'}：${text}` });
      } else if (slot.tmuxTarget) {
        // tmux send-keys -- "<literal text>" types it; then Enter submits.
        await tmux.sendKeys(slot.tmuxTarget, [text, 'Enter']);
        emit({ type: 'log', level: 'info', message: `🎙 派活 → ${slot.label ?? 'tmux'}：${text}` });
      } else {
        emit({ type: 'log', level: 'info', message: `${slot.label ?? 'session'} 不在 tmux/cmux，无法远程派活` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/not.?found|no such|unknown (?:surface|pane|session)/i.test(message)) {
        store.dropSlot?.(request.slotId);
        emit({ type: 'log', level: 'info', message: `${slot.label ?? '会话'} 已关闭，已从灯位移除` });
      } else {
        fail(message);
      }
    }
  }

  /**
   * Spawn a fresh agent session remotely. `new_session` opens one in the default
   * cwd; `branch` opens one in the selected session's project dir (fork the line
   * of work). The new session auto-registers a light via its own hooks.
   * @param {CommandRequest} request
   */
  async function handleSpawn(request) {
    const isBranch = request.action === 'branch';
    const cwd = isBranch ? (store.slotCwd?.(request.slotId) ?? defaultCwd) : defaultCwd;
    const agent = isBranch ? (findSlot(request.slotId)?.agent ?? 'claude-code') : 'claude-code';
    const command = commands[agent];
    if (!command) {
      fail(`no start command for agent ${agent}`);
      return;
    }
    try {
      if (cmux?.createSession) {
        await cmux.createSession({ cwd, command });
      } else {
        await tmux.newSession({ name: `cms-new-${process.pid}-${Math.floor(process.hrtime()[1] / 1e3)}`, cwd, command });
      }
      emit({ type: 'log', level: 'info', message: `${isBranch ? '⤴ 分叉' : '💭 新会话'} → 已在 ${cwd} 开 ${command}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fail(message);
    }
  }

  /**
   * @param {CommandRequest} request
   */
  function handleFocus(request) {
    focusedSlotId = request.slotId;
    emit({ type: 'log', level: 'info', message: `focus → slot ${request.slotId}` });
    emit({
      type: 'state',
      slots: store.snapshot(),
      focusedSlotId,
    });
  }

  /**
   * @param {CommandRequest} request
   */
  async function handleCommand(request) {
    if (!request || typeof request !== 'object') {
      fail('invalid command request');
      return;
    }
    const { action, slotId } = request;
    // new_session opens a brand-new session and carries no slotId; every other
    // action targets an existing slot and requires an integer slotId.
    if (action !== 'new_session' && (typeof slotId !== 'number' || !Number.isInteger(slotId))) {
      fail('slotId must be an integer');
      return;
    }

    switch (action) {
      case 'accept':
      case 'reject':
      case 'quick':
        await handleAcceptReject(request);
        break;
      case 'prompt':
        await handlePrompt(request);
        break;
      case 'new_session':
      case 'branch':
        await handleSpawn(request);
        break;
      case 'focus':
        handleFocus(request);
        break;
      default:
        fail(`unknown action: ${action}`);
    }
  }

  return {
    handleCommand,
    getFocusedSlotId: () => focusedSlotId,
  };
}
