import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHookFields } from './normalize-hook.js';

describe('normalizeHookFields', () => {
  it('accepts camelCase', () => {
    const n = normalizeHookFields({
      hookEventName: 'Notification',
      notificationType: 'permission_prompt',
    });
    assert.equal(n.hookEventName, 'Notification');
    assert.equal(n.notificationType, 'permission_prompt');
  });

  it('accepts official snake_case', () => {
    const n = normalizeHookFields({
      hook_event_name: 'Stop',
      notification_type: 'agent_completed',
    });
    assert.equal(n.hookEventName, 'Stop');
    assert.equal(n.notificationType, 'agent_completed');
  });

  it('prefers camelCase when both present', () => {
    const n = normalizeHookFields({
      hookEventName: 'PreToolUse',
      hook_event_name: 'Stop',
      notificationType: 'permission_prompt',
      notification_type: 'agent_completed',
    });
    assert.equal(n.hookEventName, 'PreToolUse');
    assert.equal(n.notificationType, 'permission_prompt');
  });
});
