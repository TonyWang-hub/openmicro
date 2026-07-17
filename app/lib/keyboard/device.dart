import 'package:flutter/material.dart';
import '../model/slot.dart';

/// The skeuomorphic Codex-Micro-style keyboard. Ported from the web toy v6:
/// square 4×4 layout, jelly base, whole-key RGB glow per state, key travel,
/// explicit focus ring. Pure presentation + callbacks — no networking here.
class DeviceKeyboard extends StatelessWidget {
  final List<SlotState> slots; // up to 6 agent slots
  final int? focusedSlot;
  final String reasoning; // LOW/MED/HIGH/XHIGH
  final String lcd;
  final LiveConnection? connection; // null in demo mode
  final void Function(int slotId) onAgentTap;
  final void Function(String action) onCmd; // quick/accept/reject/branch/new_session
  final VoidCallback onKnob;
  final void Function(String dir) onJoy; // left/right/up/down
  final VoidCallback onPttStart;
  final VoidCallback onPttEnd;
  final VoidCallback onTouch;
  final VoidCallback onTouchLong;

  const DeviceKeyboard({
    super.key,
    required this.slots,
    required this.focusedSlot,
    required this.reasoning,
    required this.lcd,
    required this.connection,
    required this.onAgentTap,
    required this.onCmd,
    required this.onKnob,
    required this.onJoy,
    required this.onPttStart,
    required this.onPttEnd,
    required this.onTouch,
    required this.onTouchLong,
  });

  static const _idle = Color(0xFFF5F5F5);
  static const _thinking = Color(0xFF7C9BF5);
  static const _complete = Color(0xFF7ED9A2);
  static const _needs = Color(0xFFFFC456);
  static const _error = Color(0xFFF78BB6);

  Color _stateColor(AgentState s) {
    switch (s) {
      case AgentState.thinking:
        return _thinking;
      case AgentState.complete:
        return _complete;
      case AgentState.needsInput:
        return _needs;
      case AgentState.error:
        return _error;
      default:
        return _idle;
    }
  }

  SlotState? _slot(int id) {
    for (final s in slots) {
      if (s.slotId == id) return s;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFFEDEEF2),
      alignment: Alignment.center,
      child: LayoutBuilder(builder: (ctx, box) {
        // Device designed at 360 logical px wide; scale to fill width.
        const designW = 360.0;
        final scale = (box.maxWidth / designW).clamp(0.5, 1.4);
        return Transform.scale(
          scale: scale,
          child: SizedBox(width: designW, child: _jelly(context)),
        );
      }),
    );
  }

  Widget _jelly(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(40),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xE6FCD9B8), Color(0xE6F7C9A5), Color(0xE6FBE3CD)],
        ),
        boxShadow: const [
          BoxShadow(color: Color(0x66D88C50), blurRadius: 40, offset: Offset(0, 20)),
        ],
      ),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFF0F2F4), Color(0xFFDCDFE4)],
          ),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          _legend(),
          const SizedBox(height: 8),
          _grid(),
          const SizedBox(height: 10),
          _lcd(),
        ]),
      ),
    );
  }

  Widget _legend() {
    Widget dot(Color c, String t) => Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
          const SizedBox(width: 3),
          Text(t, style: const TextStyle(fontSize: 8, color: Color(0xFF8A919B), letterSpacing: 0.5)),
        ]);
    return Wrap(spacing: 8, runSpacing: 2, alignment: WrapAlignment.center, children: [
      dot(_idle, 'IDLE'),
      dot(_thinking, 'THINKING'),
      dot(_complete, 'COMPLETE'),
      dot(_needs, 'NEEDS'),
      dot(_error, 'ERROR'),
    ]);
  }

  Widget _grid() {
    const gap = 8.0;
    return Column(children: [
      Row(children: [
        _knob(), const SizedBox(width: gap),
        _agent(0), const SizedBox(width: gap),
        _agent(1), const SizedBox(width: gap),
        _joy(),
      ]),
      const SizedBox(height: gap),
      Row(children: [
        _agent(2), const SizedBox(width: gap),
        _agent(3), const SizedBox(width: gap),
        _agent(4), const SizedBox(width: gap),
        _agent(5),
      ]),
      const SizedBox(height: gap),
      Row(children: [
        _cmd('quick', '⚡'), const SizedBox(width: gap),
        _cmd('accept', '◎✓'), const SizedBox(width: gap),
        _cmd('reject', '⊗'), const SizedBox(width: gap),
        _cmd('branch', '⤴'),
      ]),
      const SizedBox(height: gap),
      Row(children: [
        _touch(), const SizedBox(width: gap),
        _mic(), const SizedBox(width: gap),
        _cmd('new_session', '💭'),
      ]),
    ]);
  }

  static const _keySize = 64.0;

  Widget _keyShell({required Widget child, required Color topColor, Color? glow, bool focused = false}) {
    return Container(
      width: _keySize,
      height: _keySize,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: topColor,
        border: focused ? Border.all(color: const Color(0xFF1F2937), width: 3) : Border.all(color: const Color(0xFFD5D9DE)),
        boxShadow: [
          const BoxShadow(color: Color(0xFFC7CCD2), offset: Offset(0, 5)),
          if (glow != null) BoxShadow(color: glow, blurRadius: 20, spreadRadius: 1),
        ],
      ),
      alignment: Alignment.center,
      child: child,
    );
  }

  Widget _agent(int id) {
    final slot = _slot(id);
    final st = slot?.state ?? AgentState.idle;
    final active = st != AgentState.idle && st != AgentState.unknown;
    final c = _stateColor(st);
    return GestureDetector(
      onTap: () => onAgentTap(id),
      child: _keyShell(
        focused: focusedSlot == id,
        topColor: active ? c.withValues(alpha: 0.78) : Colors.white.withValues(alpha: 0.42),
        glow: active ? c : null,
        child: Container(
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(6),
            color: active ? Colors.white.withValues(alpha: 0.25) : Colors.white.withValues(alpha: 0.55),
          ),
          alignment: Alignment.center,
          child: Text('✛', style: TextStyle(color: active ? Colors.white : const Color(0xFF9AA4B5), fontSize: 13)),
        ),
      ),
    );
  }

  Widget _cmd(String action, String glyph) {
    return GestureDetector(
      onTap: () => onCmd(action),
      child: _keyShell(
        topColor: Colors.white,
        child: Text(glyph, style: const TextStyle(fontSize: 22, color: Color(0xFF3A3F47))),
      ),
    );
  }

  Widget _knob() {
    return GestureDetector(
      onTap: onKnob,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: _keySize, height: _keySize - 12,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: SweepGradient(colors: [Color(0xFFFFFFFF), Color(0xFFD5D8DD), Color(0xFFF2F4F6), Color(0xFFE0E3E8)]),
            boxShadow: [BoxShadow(color: Color(0x3D000000), blurRadius: 10, offset: Offset(0, 6))],
          ),
          alignment: Alignment.topCenter,
          child: Container(margin: const EdgeInsets.only(top: 5), width: 4, height: 16, color: const Color(0xFFC4C8CF)),
        ),
        Text(reasoning, style: const TextStyle(fontSize: 7, color: Color(0xFF6B7280))),
      ]),
    );
  }

  Widget _joy() {
    return GestureDetector(
      onTapUp: (d) {
        // Quadrant → direction, based on tap position within the cap.
        final local = d.localPosition;
        final dx = local.dx - _keySize / 2;
        final dy = local.dy - _keySize / 2;
        final horizontal = dx.abs() > dy.abs();
        onJoy(horizontal ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      },
      child: Container(
        width: _keySize, height: _keySize,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFF9AA0A8), width: 2, style: BorderStyle.solid),
        ),
        alignment: Alignment.center,
        child: Container(
          width: 46, height: 46,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(center: Alignment(-0.3, -0.4), colors: [Color(0xFF464A51), Color(0xFF101216)]),
          ),
        ),
      ),
    );
  }

  Widget _mic() {
    return GestureDetector(
      onTapDown: (_) => onPttStart(),
      onTapUp: (_) => onPttEnd(),
      onTapCancel: onPttEnd,
      child: Container(
        width: _keySize * 2 + 8, height: _keySize,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: Colors.white,
          border: Border.all(color: const Color(0xFFD5D9DE)),
          boxShadow: const [BoxShadow(color: Color(0xFFC7CCD2), offset: Offset(0, 5))],
        ),
        alignment: Alignment.center,
        child: const Text('🎙', style: TextStyle(fontSize: 22)),
      ),
    );
  }

  Widget _touch() {
    return GestureDetector(
      onTap: onTouch,
      onLongPress: onTouchLong,
      child: SizedBox(
        width: _keySize,
        height: _keySize,
        child: Align(
          alignment: Alignment.bottomLeft,
          child: Container(
            width: 34, height: 34,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(center: Alignment(-0.3, -0.4), colors: [Color(0xFF33363B), Color(0xFF0C0E11)]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _lcd() {
    Color connColor() {
      switch (connection) {
        case LiveConnection.connected:
          return _complete;
        case LiveConnection.connecting:
          return _needs;
        case LiveConnection.disconnected:
          return _error;
        default:
          return Colors.transparent;
      }
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        gradient: const LinearGradient(colors: [Color(0xFF0D1015), Color(0xFF151A21)]),
        border: Border.all(color: const Color(0xFF262C36)),
      ),
      child: Row(children: [
        if (connection != null) ...[
          Container(width: 8, height: 8, decoration: BoxDecoration(color: connColor(), shape: BoxShape.circle)),
          const SizedBox(width: 8),
        ],
        Expanded(
          child: Text(lcd,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFF8BE9FD), fontSize: 11, fontFamily: 'monospace')),
        ),
      ]),
    );
  }
}
