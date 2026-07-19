@Tags(['golden'])
library;

// Golden (screenshot) regression tests for `DeviceKeyboard`
// (lib/keyboard/device.dart). These lock down the visual output of the
// skeuomorphic keyboard so styling changes don't silently break the look.
//
// These are a *local* regression tool, not part of the CI-gated suite:
// pixel-level anti-aliasing differs between macOS (where baselines are
// generated) and Linux CI runners, so `--exclude-tags golden` is used in CI
// (see .github/workflows/ci.yml) and baselines are only meaningful when
// regenerated/compared on the same platform they were created on.
//
// Regenerate baselines after an intentional style change:
//   cd app && flutter test --update-goldens --tags golden
//
// Run just the golden suite:
//   cd app && flutter test --tags golden
//
// Run everything except goldens (what CI does):
//   cd app && flutter test --exclude-tags golden

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openmicro/keyboard/device.dart';
import 'package:openmicro/model/slot.dart';

/// Fixed logical size for the harness so the golden baseline is stable
/// regardless of the host window/test-runner default surface size.
const _goldenSize = Size(400, 700);

List<SlotState> _allIdleSlots() => const [
      SlotState(slotId: 0, label: 'alpha', state: AgentState.idle, canInject: true),
      SlotState(slotId: 1, label: 'beta', state: AgentState.idle, canInject: true),
      SlotState(slotId: 2, label: 'gamma', state: AgentState.idle, canInject: true),
      SlotState(slotId: 3, label: 'delta', state: AgentState.idle, canInject: true),
      SlotState(slotId: 4, label: 'epsilon', state: AgentState.idle, canInject: true),
      SlotState(slotId: 5, label: 'zeta', state: AgentState.idle, canInject: true),
    ];

List<SlotState> _mixedSlots() => const [
      SlotState(slotId: 0, label: 'alpha', state: AgentState.thinking, canInject: true),
      SlotState(slotId: 1, label: 'beta', state: AgentState.needsInput, canInject: true),
      SlotState(slotId: 2, label: 'gamma', state: AgentState.complete, canInject: false),
      SlotState(slotId: 3, label: 'delta', state: AgentState.error, canInject: true),
      SlotState(slotId: 4, label: 'epsilon', state: AgentState.idle, canInject: false),
      SlotState(slotId: 5, label: null, state: AgentState.unknown, canInject: false),
    ];

Widget _harness({
  required List<SlotState> slots,
  int? focusedSlot,
  String reasoning = 'HIGH',
  String lcd = 'ready',
  LiveConnection? connection = LiveConnection.connected,
}) {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Scaffold(
      body: DeviceKeyboard(
        slots: slots,
        focusedSlot: focusedSlot,
        reasoning: reasoning,
        lcd: lcd,
        connection: connection,
        onAgentTap: (_) {},
        onCmd: (_) {},
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

Future<void> _pumpFixed(WidgetTester tester, Widget widget) async {
  tester.view.physicalSize = _goldenSize;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(widget);
  await tester.pump();
  // Drain the known cosmetic RenderFlex-overflow assertion documented in
  // device_widget_test.dart (debug-only, doesn't affect paint/hit-testing).
  tester.takeException();
}

void main() {
  group('DeviceKeyboard goldens', () {
    testWidgets('all slots idle', (tester) async {
      await _pumpFixed(
        tester,
        _harness(slots: _allIdleSlots(), reasoning: 'HIGH', lcd: 'ready'),
      );

      await expectLater(
        find.byType(DeviceKeyboard),
        matchesGoldenFile('goldens/device_all_idle.png'),
      );
    });

    testWidgets('mixed agent states (thinking/needsInput/complete/error/unknown)', (tester) async {
      await _pumpFixed(
        tester,
        _harness(
          slots: _mixedSlots(),
          reasoning: 'XHIGH',
          lcd: 'agent beta needs input',
          connection: LiveConnection.connecting,
        ),
      );

      await expectLater(
        find.byType(DeviceKeyboard),
        matchesGoldenFile('goldens/device_mixed_states.png'),
      );
    });

    testWidgets('a slot is focused (extra focus ring)', (tester) async {
      await _pumpFixed(
        tester,
        _harness(
          slots: _mixedSlots(),
          focusedSlot: 3,
          reasoning: 'HIGH',
          lcd: 'focused: delta',
        ),
      );

      await expectLater(
        find.byType(DeviceKeyboard),
        matchesGoldenFile('goldens/device_focused_slot.png'),
      );
    });

    testWidgets('disconnected connection state', (tester) async {
      await _pumpFixed(
        tester,
        _harness(
          slots: _allIdleSlots(),
          reasoning: 'LOW',
          lcd: 'disconnected',
          connection: LiveConnection.disconnected,
        ),
      );

      await expectLater(
        find.byType(DeviceKeyboard),
        matchesGoldenFile('goldens/device_disconnected.png'),
      );
    });
  });
}
