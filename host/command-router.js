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
   * @param {CommandRequest} request
   */
  async function handleNewSession(request) {
    const { slotId } = request;
    if (slotId < 0 || slotId >= maxSlots) {
      fail(`slot ${slotId} out of range (max ${maxSlots})`);
      return;
    }

    let slot = findSlot(slotId);
    if (!slot) {
      if (store.snapshot().length >= maxSlots) {
        fail(`cannot open more than ${maxSlots} slots`);
        return;
      }
      fail(`slot ${slotId} not bound`);
      return;
    }

    // The tmux session name is the injectable target (from the forwarder), or
    // the sessionKey when a slot was statically pre-bound.
    const tmuxName = slot.tmuxTarget ?? slot.sessionKey;
    try {
      const exists = await tmux.sessionExists(tmuxName);
      if (!exists) {
        const command = commands[slot.agent];
        if (!command) {
          fail(`no start command for agent ${slot.agent}`);
          return;
        }
        await tmux.newSession({
          name: tmuxName,
          cwd: defaultCwd,
          command,
        });
        emit({
          type: 'log',
          level: 'info',
          message: `created tmux session ${tmuxName} (${command})`,
        });
      } else {
        emit({
          type: 'log',
          level: 'info',
          message: `reattach existing session ${tmuxName}`,
        });
      }
      attachPty(slot.slotId, tmuxName);
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
    if (typeof slotId !== 'number' || !Number.isInteger(slotId)) {
      fail('slotId must be an integer');
      return;
    }

    switch (action) {
      case 'accept':
      case 'reject':
      case 'quick':
        await handleAcceptReject(request);
        break;
      case 'new_session':
        await handleNewSession(request);
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
