/**
 * Normalize official hook stdin field names (snake_case) to camelCase
 * used by adapters. Accepts either form; camelCase wins if both present.
 *
 * @param {Record<string, unknown>} raw
 * @returns {{ hookEventName?: string, notificationType?: string } & Record<string, unknown>}
 */
export function normalizeHookFields(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const hookEventName =
    typeof raw.hookEventName === 'string'
      ? raw.hookEventName
      : (typeof raw.hook_event_name === 'string' ? raw.hook_event_name : undefined);
  const notificationType =
    typeof raw.notificationType === 'string'
      ? raw.notificationType
      : (typeof raw.notification_type === 'string' ? raw.notification_type : undefined);
  return { ...raw, hookEventName, notificationType };
}
