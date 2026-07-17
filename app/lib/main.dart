import 'package:flutter/material.dart';
import 'model/slot.dart';
import 'keyboard/device.dart';

// M1: static keyboard screen with demo data so the device renders and the
// layout can be验收. M2 wires this to LiveClient/Haptics/KeySound (separate
// modules built in parallel); this file is the integration point.
void main() => runApp(const MicroToyApp());

class MicroToyApp extends StatelessWidget {
  const MicroToyApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MicroToy',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(useMaterial3: true, brightness: Brightness.light),
      home: const KeyboardScreen(),
    );
  }
}

class KeyboardScreen extends StatefulWidget {
  const KeyboardScreen({super.key});
  @override
  State<KeyboardScreen> createState() => _KeyboardScreenState();
}

class _KeyboardScreenState extends State<KeyboardScreen> {
  final List<SlotState> _slots = const [
    SlotState(slotId: 0, label: 'my-project', state: AgentState.thinking, canInject: true),
    SlotState(slotId: 1, label: 'banana-mall', state: AgentState.needsInput, canInject: true),
    SlotState(slotId: 2, label: 'task-pool', state: AgentState.complete, canInject: false),
  ];
  int? _focused;
  String _reasoning = 'MED';
  String _lcd = "LET'S BUILD — 选一盏灯，按 ◎✓/⊗";

  void _flash(String t) => setState(() => _lcd = t);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFEDEEF2),
      body: SafeArea(
        child: DeviceKeyboard(
          slots: _slots,
          focusedSlot: _focused,
          reasoning: _reasoning,
          lcd: _lcd,
          connection: LiveConnection.connected,
          onAgentTap: (id) => setState(() {
            _focused = id;
            _lcd = '已选中 agent $id（◎✓/⊗ 只作用于它）';
          }),
          onCmd: (a) {
            if ((a == 'accept' || a == 'reject' || a == 'quick') && _focused == null) {
              _flash('先点一盏 Agent 灯选中它');
              return;
            }
            _flash('$a → agent $_focused');
          },
          onKnob: () => setState(() {
            const levels = ['LOW', 'MED', 'HIGH', 'XHIGH'];
            _reasoning = levels[(levels.indexOf(_reasoning) + 1) % levels.length];
            _lcd = '思考力度 → $_reasoning';
          }),
          onJoy: (d) => _flash('摇杆 $d'),
          onPttStart: () => _flash('🎙 录音中…'),
          onPttEnd: () => _flash('🎙 语音已发'),
          onTouch: () => _flash('触摸：嘀（长按切音色）'),
          onTouchLong: () => _flash('音色切换'),
        ),
      ),
    );
  }
}
