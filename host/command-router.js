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
    const keys = keymap[slot.agent]?.[request.action];
    if (!keys?.length) {
      fail(`no keymap for ${slot.agent}.${request.action}`);
      return;
    }
    try {
      await tmux.sendKeys(slot.sessionKey, keys);
      emit({ type: 'log', level: 'info', message: `${request.action} → ${slot.sessionKey}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fail(message);
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

    try {
      const exists = await tmux.sessionExists(slot.sessionKey);
      if (!exists) {
        const command = commands[slot.agent];
        if (!command) {
          fail(`no start command for agent ${slot.agent}`);
          return;
        }
        await tmux.newSession({
          name: slot.sessionKey,
          cwd: defaultCwd,
          command,
        });
        emit({
          type: 'log',
          level: 'info',
          message: `created tmux session ${slot.sessionKey} (${command})`,
        });
      } else {
        emit({
          type: 'log',
          level: 'info',
          message: `reattach existing session ${slot.sessionKey}`,
        });
      }
      attachPty(slot.slotId, slot.sessionKey);
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
