import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapClaudeHook } from './claude-code.js';

const b = { slotId: 0, agent: 'claude-code', sessionKey: 'cms-claude-0' };

describe('mapClaudeHook', () => {
  it('maps SessionStart to idle', () => {
    assert.equal(mapClaudeHook({ hookEventName: 'SessionStart' }, b).state, 'idle');
  });

  it('maps PreToolUse to thinking', () => {
    const e = mapClaudeHook({ hookEventName: 'PreToolUse' }, b);
    assert.equal(e.state, 'thinking');
    assert.equal(e.source, 'cc-hooks');
    assert.equal(e.sessionKey, 'cms-claude-0');
    assert.equal(e.v, 1);
    assert.equal(e.slotId, 0);
    assert.equal(e.agent, 'claude-code');
    assert.ok(e.ts);
  });

  it('maps UserPromptSubmit to thinking', () => {
    assert.equal(mapClaudeHook({ hookEventName: 'UserPromptSubmit' }, b).state, 'thinking');
  });

  it('maps permission Notification to needs_input', () => {
    const e = mapClaudeHook({
      hookEventName: 'Notification',
      notificationType: 'permission_prompt',
    }, b);
    assert.equal(e.state, 'needs_input');
  });

  it('maps agent_needs_input Notification to needs_input', () => {
    const e = mapClaudeHook({
      hookEventName: 'Notification',
      notificationType: 'agent_needs_input',
    }, b);
    assert.equal(e.state, 'needs_input');
  });

  it('maps elicitation_* Notification to needs_input', () => {
    const e = mapClaudeHook({
      hookEventName: 'Notification',
      notificationType: 'elicitation_followup',
    }, b);
    assert.equal(e.state, 'needs_input');
  });

  it('maps agent_completed Notification to complete', () => {
    assert.equal(
      mapClaudeHook({ hookEventName: 'Notification', notificationType: 'agent_completed' }, b).state,
      'complete',
    );
  });

  it('maps Stop to complete', () => {
    assert.equal(mapClaudeHook({ hookEventName: 'Stop' }, b).state, 'complete');
  });

  it('maps StopFailure to error', () => {
    assert.equal(mapClaudeHook({ hookEventName: 'StopFailure' }, b).state, 'error');
  });

  it('maps SessionEnd to idle', () => {
    assert.equal(mapClaudeHook({ hookEventName: 'SessionEnd' }, b).state, 'idle');
  });

  it('returns null for unknown hook events', () => {
    assert.equal(mapClaudeHook({ hookEventName: 'PostToolUse' }, b), null);
  });

  it('maps unknown Notification types to needs_input (a Notification means Claude wants attention; dropping it kills the yellow light)', () => {
    assert.equal(
      mapClaudeHook({ hookEventName: 'Notification', notificationType: 'info' }, b).state,
      'needs_input',
    );
    // Notification with no type field at all (older CLI payloads) — same default.
    assert.equal(
      mapClaudeHook({ hookEventName: 'Notification' }, b).state,
      'needs_input',
    );
  });

  it('accepts official snake_case stdin (hook_event_name)', () => {
    const e = mapClaudeHook({ hook_event_name: 'PreToolUse' }, b);
    assert.equal(e.state, 'thinking');
    assert.equal(e.source, 'cc-hooks');
  });

  it('accepts snake_case Notification + notification_type', () => {
    const e = mapClaudeHook({
      hook_event_name: 'Notification',
      notification_type: 'agent_needs_input',
    }, b);
    assert.equal(e.state, 'needs_input');
  });
});
