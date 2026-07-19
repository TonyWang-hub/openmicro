import 'package:flutter_test/flutter_test.dart';
import 'package:openmicro/model/slot.dart';

void main() {
  group('SlotState.fromJson', () {
    test('parses all fields and canInject=true when cmuxTarget is set', () {
      final slot = SlotState.fromJson({
        'slotId': 0,
        'label': 'my-project',
        'state': 'thinking',
        'cmuxTarget': 'pane-1',
        'tmuxTarget': null,
      });

      expect(slot.slotId, 0);
      expect(slot.label, 'my-project');
      expect(slot.state, AgentState.thinking);
      expect(slot.canInject, isTrue);
    });

    test('canInject=true when only tmuxTarget is set', () {
      final slot = SlotState.fromJson({
        'slotId': 1,
        'label': 'foo',
        'state': 'idle',
        'cmuxTarget': null,
        'tmuxTarget': 'session-0',
      });

      expect(slot.canInject, isTrue);
    });

    test('canInject=false when both cmuxTarget and tmuxTarget are null', () {
      final slot = SlotState.fromJson({
        'slotId': 2,
        'label': null,
        'state': 'idle',
        'cmuxTarget': null,
        'tmuxTarget': null,
      });

      expect(slot.label, isNull);
      expect(slot.canInject, isFalse);
    });

    test('canInject=true when both cmuxTarget and tmuxTarget are set', () {
      final slot = SlotState.fromJson({
        'slotId': 3,
        'label': 'both',
        'state': 'error',
        'cmuxTarget': 'pane-2',
        'tmuxTarget': 'session-1',
      });

      expect(slot.canInject, isTrue);
    });

    test('missing state key falls back to unknown via agentStateFromWire', () {
      final slot = SlotState.fromJson({
        'slotId': 4,
        'label': 'x',
        'cmuxTarget': null,
        'tmuxTarget': null,
      });

      expect(slot.state, AgentState.unknown);
    });
  });

  group('agentStateFromWire', () {
    test('maps every known wire value', () {
      expect(agentStateFromWire('idle'), AgentState.idle);
      expect(agentStateFromWire('thinking'), AgentState.thinking);
      expect(agentStateFromWire('complete'), AgentState.complete);
      expect(agentStateFromWire('needs_input'), AgentState.needsInput);
      expect(agentStateFromWire('error'), AgentState.error);
    });

    test('unknown or null values fall back to AgentState.unknown', () {
      expect(agentStateFromWire('bogus'), AgentState.unknown);
      expect(agentStateFromWire(null), AgentState.unknown);
      expect(agentStateFromWire(''), AgentState.unknown);
    });
  });

  group('slotCommandToWire', () {
    test('maps every SlotCommand to its wire string', () {
      expect(slotCommandToWire(SlotCommand.accept), 'accept');
      expect(slotCommandToWire(SlotCommand.reject), 'reject');
      expect(slotCommandToWire(SlotCommand.quick), 'quick');
      expect(slotCommandToWire(SlotCommand.focus), 'focus');
    });
  });
}
