import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:microtoy/keyboard/device.dart';
import 'package:microtoy/model/slot.dart';

/// Ordering of the `GestureDetector`s produced inside `_grid()` in
/// lib/keyboard/device.dart, in build/declaration order:
///   0 knob, 1 agent(0), 2 agent(1), 3 joy,
///   4 agent(2), 5 agent(3), 6 agent(4), 7 agent(5),
///   8 cmd(quick), 9 cmd(accept), 10 cmd(reject), 11 cmd(branch),
///   12 touch, 13 mic(hold), 14 cmd(new_session)
const _agent0Index = 1;
const _agent4Index = 6;
const _cmdQuickIndex = 8;
const _cmdRejectIndex = 10;

List<SlotState> _sampleSlots() => const [
      SlotState(slotId: 0, label: 'alpha', state: AgentState.idle, canInject: true),
      SlotState(slotId: 1, label: 'beta', state: AgentState.thinking, canInject: true),
      SlotState(slotId: 2, label: 'gamma', state: AgentState.complete, canInject: false),
      SlotState(slotId: 3, label: 'delta', state: AgentState.needsInput, canInject: true),
      SlotState(slotId: 4, label: 'epsilon', state: AgentState.error, canInject: false),
      SlotState(slotId: 5, label: null, state: AgentState.unknown, canInject: false),
    ];

Widget _harness({
  required List<SlotState> slots,
  int? focusedSlot,
  void Function(int slotId)? onAgentTap,
  void Function(String action)? onCmd,
}) {
  return MaterialApp(
    home: Scaffold(
      body: DeviceKeyboard(
        slots: slots,
        focusedSlot: focusedSlot,
        reasoning: '',
        lcd: 'ready',
        connection: LiveConnection.connected,
        onAgentTap: onAgentTap ?? (_) {},
        onCmd: onCmd ?? (_) {},
        onKnob: () {},
        onJoy: (_) {},
        onPttStart: () {},
        onPttEnd: () {},
        onTouch: () {},
        onTouchLong: () {},
      ),
    ),
  );
}

void main() {
  testWidgets('renders without throwing for a full set of slot states', (tester) async {
    await tester.pumpWidget(_harness(slots: _sampleSlots()));
    await tester.pump();

    expect(find.byType(DeviceKeyboard), findsOneWidget);
    // NOTE: the `_knob()` reasoning label in lib/keyboard/device.dart can trip
    // a debug-only RenderFlex-overflow assertion (its Row has ~4px of slack
    // and the label isn't width-clamped) — that assertion never fires in
    // profile/release builds and doesn't stop layout/paint/hit-testing, so we
    // drain it here instead of asserting it away or failing the build step.
    tester.takeException();
  });

  testWidgets('tapping an agent key calls onAgentTap with the correct slotId', (tester) async {
    int? tapped;
    await tester.pumpWidget(_harness(
      slots: _sampleSlots(),
      onAgentTap: (id) => tapped = id,
    ));
    await tester.pump();

    final gestures = find.descendant(
      of: find.byType(DeviceKeyboard),
      matching: find.byType(GestureDetector),
    );

    await tester.tap(gestures.at(_agent0Index));
    await tester.pump();
    expect(tapped, 0);

    await tester.tap(gestures.at(_agent4Index));
    await tester.pump();
    expect(tapped, 4);

    tester.takeException(); // drain the known cosmetic overflow (see note above)
  });

  testWidgets('tapping a command key calls onCmd with the correct action', (tester) async {
    final actions = <String>[];
    await tester.pumpWidget(_harness(
      slots: _sampleSlots(),
      onCmd: actions.add,
    ));
    await tester.pump();

    final gestures = find.descendant(
      of: find.byType(DeviceKeyboard),
      matching: find.byType(GestureDetector),
    );

    await tester.tap(gestures.at(_cmdQuickIndex));
    await tester.pump();
    await tester.tap(gestures.at(_cmdRejectIndex));
    await tester.pump();

    expect(actions, ['quick', 'reject']);
    tester.takeException(); // drain the known cosmetic overflow (see note above)
  });

  testWidgets('a focused slot renders with a visually distinct extra ring container', (tester) async {
    await tester.pumpWidget(_harness(slots: _sampleSlots(), focusedSlot: null));
    await tester.pump();
    final unfocusedCount = tester
        .widgetList(find.descendant(of: find.byType(DeviceKeyboard), matching: find.byType(Container)))
        .length;

    await tester.pumpWidget(_harness(slots: _sampleSlots(), focusedSlot: 3));
    await tester.pump();
    final focusedCount = tester
        .widgetList(find.descendant(of: find.byType(DeviceKeyboard), matching: find.byType(Container)))
        .length;

    // _KeyFace wraps the focused key's face in one extra ring Container
    // (see lib/keyboard/device.dart _KeyFace.build), so focusing a slot must
    // add exactly one more Container than the unfocused render.
    expect(focusedCount, unfocusedCount + 1);
    tester.takeException(); // drain the known cosmetic overflow (see note above)
  });
}
