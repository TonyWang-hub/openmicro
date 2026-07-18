import 'package:flutter/material.dart';
import '../model/slot.dart';

/// The skeuomorphic Codex-Micro-style keyboard. Ported from the web toy v6
/// with the polish pass: real key-press travel (down + rebound), ✛ axis drawn
/// (not a font glyph), corner screws, side etch text, embedded OLED LCD.
class DeviceKeyboard extends StatelessWidget {
  final List<SlotState> slots;
  final int? focusedSlot;
  final String reasoning;
  final String lcd;
  final LiveConnection? connection;
  final void Function(int slotId) onAgentTap;
  final void Function(String action) onCmd;
  final VoidCallback onKnob;
  final void Function(String dir) onJoy;
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

  static const idle = Color(0xFFF5F5F5);
  static const thinking = Color(0xFF7C9BF5);
  static const complete = Color(0xFF7ED9A2);
  static const needs = Color(0xFFFFC456);
  static const error = Color(0xFFF78BB6);

  static Color stateColor(AgentState s) {
    switch (s) {
      case AgentState.thinking:
        return thinking;
      case AgentState.complete:
        return complete;
      case AgentState.needsInput:
        return needs;
      case AgentState.error:
        return error;
      default:
        return idle;
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
        const designW = 360.0;
        final scale = (box.maxWidth / designW).clamp(0.5, 1.5);
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
        borderRadius: BorderRadius.circular(42),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xF2FCD9B8), Color(0xF2F7C9A5), Color(0xF2FBE3CD)],
        ),
        boxShadow: const [
          BoxShadow(color: Color(0xBBEDB287), offset: Offset(0, 4)),
          BoxShadow(color: Color(0x61D88C50), blurRadius: 34, offset: Offset(0, 14)),
          BoxShadow(color: Color(0x38D88C50), blurRadius: 60, offset: Offset(0, 30)),
        ],
      ),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(26),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFF0F2F4), Color(0xFFDCDFE4)],
          ),
          boxShadow: const [
            BoxShadow(color: Colors.white, offset: Offset(0, 2), blurRadius: 3),
            BoxShadow(color: Color(0x1F000000), offset: Offset(0, 8), blurRadius: 14),
          ],
        ),
        child: Stack(children: [
          // corner screws + etch text overlaid on the plate
          const Positioned(top: 2, left: 2, child: _Screw()),
          const Positioned(top: 2, right: 2, child: _Screw()),
          const Positioned(bottom: 2, left: 2, child: _Screw()),
          const Positioned(bottom: 2, right: 2, child: _Screw()),
          Column(mainAxisSize: MainAxisSize.min, children: [
            const _TopMark(),
            _legend(),
            const SizedBox(height: 6),
            _grid(),
            const SizedBox(height: 10),
            _lcd(),
          ]),
        ]),
      ),
    );
  }

  Widget _legend() {
    Widget dot(Color c, String t) => Row(mainAxisSize: MainAxisSize.min, children: [
          Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                  color: c,
                  shape: BoxShape.circle,
                  border: c == idle ? Border.all(color: const Color(0xFFC9CED5)) : null)),
          const SizedBox(width: 3),
          Text(t, style: const TextStyle(fontSize: 8, color: Color(0xFF8A919B), letterSpacing: 0.5)),
        ]);
    return Wrap(spacing: 9, runSpacing: 2, alignment: WrapAlignment.center, children: [
      dot(idle, 'IDLE'),
      dot(thinking, 'THINKING'),
      dot(complete, 'COMPLETE'),
      dot(needs, 'NEEDS'),
      dot(error, 'ERROR'),
    ]);
  }

  static const _gap = 8.0;

  Widget _grid() {
    return Column(children: [
      Row(children: [
        _knob(), const SizedBox(width: _gap),
        _agent(0), const SizedBox(width: _gap),
        _agent(1), const SizedBox(width: _gap),
        _joy(),
      ]),
      const SizedBox(height: _gap),
      Row(children: [
        _agent(2), const SizedBox(width: _gap),
        _agent(3), const SizedBox(width: _gap),
        _agent(4), const SizedBox(width: _gap),
        _agent(5),
      ]),
      const SizedBox(height: _gap),
      Row(children: [
        _cmd('quick', const Icon(Icons.bolt, color: Color(0xFFF5A623), size: 26)), const SizedBox(width: _gap),
        _cmd('accept', const _AcceptGlyph()), const SizedBox(width: _gap),
        _cmd('reject', const Icon(Icons.cancel_outlined, color: Color(0xFF3A3F47), size: 24)), const SizedBox(width: _gap),
        _cmd('branch', const Icon(Icons.turn_right, color: Color(0xFF3A3F47), size: 24)),
      ]),
      const SizedBox(height: _gap),
      Row(children: [
        _touch(), const SizedBox(width: _gap),
        _mic(), const SizedBox(width: _gap),
        _cmd('new_session', const Icon(Icons.mode_comment_outlined, color: Color(0xFF3A3F47), size: 22)),
      ]),
    ]);
  }

  static const _keySize = 64.0;

  Widget _agent(int id) {
    final slot = _slot(id);
    final st = slot?.state ?? AgentState.idle;
    final active = st != AgentState.idle && st != AgentState.unknown;
    final c = stateColor(st);
    return _PressableKey(
      onTap: () => onAgentTap(id),
      pulse: st == AgentState.needsInput,
      builder: (pressed) => _KeyFace(
        pressed: pressed,
        focused: focusedSlot == id,
        color: active ? c.withValues(alpha: 0.80) : Colors.white.withValues(alpha: 0.42),
        glow: active ? c : null,
        translucent: !active,
        child: _AxisCross(active: active),
      ),
    );
  }

  Widget _cmd(String action, Widget glyph) {
    return _PressableKey(
      onTap: () => onCmd(action),
      builder: (pressed) => _KeyFace(pressed: pressed, color: Colors.white, child: glyph),
    );
  }

  Widget _knob() {
    return _PressableKey(
      onTap: onKnob,
      builder: (pressed) => Column(mainAxisSize: MainAxisSize.min, children: [
        Transform.translate(
          offset: Offset(0, pressed ? 2 : 0),
          child: Container(
            width: _keySize,
            height: _keySize - 12,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const SweepGradient(
                  startAngle: 3.6,
                  colors: [Color(0xFFFFFFFF), Color(0xFFD5D8DD), Color(0xFFF2F4F6), Color(0xFFE0E3E8), Color(0xFFFFFFFF)]),
              border: Border.all(color: const Color(0xFFC3C7CD)),
              boxShadow: [BoxShadow(color: const Color(0x3D000000), blurRadius: pressed ? 5 : 10, offset: Offset(0, pressed ? 3 : 6))],
            ),
            alignment: Alignment.topCenter,
            child: Container(
                margin: const EdgeInsets.only(top: 6),
                width: 4,
                height: 16,
                decoration: BoxDecoration(color: const Color(0xFFC4C8CF), borderRadius: BorderRadius.circular(2))),
          ),
        ),
        const SizedBox(height: 2),
        Text('REASONING · $reasoning',
            style: const TextStyle(fontSize: 6.5, color: Color(0xFF6B7280), letterSpacing: 0.5)),
      ]),
    );
  }

  Widget _joy() {
    return _PressableKey(
      onTapAt: (local) {
        final dx = local.dx - _keySize / 2;
        final dy = local.dy - _keySize / 2;
        onJoy(dx.abs() > dy.abs() ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      },
      builder: (pressed) => Container(
        width: _keySize,
        height: _keySize,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFF9AA0A8), width: 2),
        ),
        alignment: Alignment.center,
        child: Transform.scale(
          scale: pressed ? 0.94 : 1,
          child: Container(
            width: 48,
            height: 48,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(center: Alignment(-0.3, -0.4), colors: [Color(0xFF464A51), Color(0xFF101216)]),
              boxShadow: [BoxShadow(color: Color(0x59000000), blurRadius: 10, offset: Offset(0, 6))],
            ),
          ),
        ),
      ),
    );
  }

  Widget _mic() {
    return _HoldKey(
      onStart: onPttStart,
      onEnd: onPttEnd,
      builder: (pressed) => Container(
        width: _keySize * 2 + _gap,
        height: _keySize,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: Colors.white,
          border: Border.all(color: pressed ? error : const Color(0xFFD5D9DE), width: pressed ? 2 : 1),
          boxShadow: [
            BoxShadow(color: const Color(0xFFC7CCD2), offset: Offset(0, pressed ? 2 : 6)),
            if (pressed) const BoxShadow(color: error, blurRadius: 22, spreadRadius: 1),
          ],
        ),
        alignment: Alignment.center,
        child: const Icon(Icons.mic, color: Color(0xFF3A3F47), size: 26),
      ),
    );
  }

  Widget _touch() {
    return _PressableKey(
      onTap: onTouch,
      onLongPress: onTouchLong,
      travel: false,
      builder: (pressed) => SizedBox(
        width: _keySize,
        height: _keySize,
        child: Align(
          alignment: Alignment.bottomLeft,
          child: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const RadialGradient(center: Alignment(-0.3, -0.4), colors: [Color(0xFF33363B), Color(0xFF0C0E11)]),
              boxShadow: [BoxShadow(color: const Color(0x59000000), blurRadius: pressed ? 3 : 7, offset: const Offset(0, 2))],
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
          return complete;
        case LiveConnection.connecting:
          return needs;
        case LiveConnection.disconnected:
          return error;
        default:
          return Colors.transparent;
      }
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF0D1015), Color(0xFF151A21)]),
        border: Border.all(color: const Color(0xFF262C36)),
        boxShadow: const [BoxShadow(color: Color(0xB3000000), blurRadius: 8, offset: Offset(0, 2), spreadRadius: -2)],
      ),
      child: Row(children: [
        if (connection != null) ...[
          Container(width: 8, height: 8, decoration: BoxDecoration(color: connColor(), shape: BoxShape.circle, boxShadow: [BoxShadow(color: connColor(), blurRadius: 6)])),
          const SizedBox(width: 8),
        ],
        Expanded(
          child: Text(lcd,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFF8BE9FD), fontSize: 11.5, fontFamily: 'monospace')),
        ),
      ]),
    );
  }
}

/// A key face with the pressed-down travel + shadow, focus ring, glow.
class _KeyFace extends StatelessWidget {
  final bool pressed;
  final bool focused;
  final Color color;
  final Color? glow;
  final bool translucent;
  final Widget child;
  const _KeyFace({
    required this.pressed,
    this.focused = false,
    required this.color,
    this.glow,
    this.translucent = false,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 70),
      transform: Matrix4.translationValues(0, pressed ? 4 : 0, 0),
      width: DeviceKeyboard._keySize,
      height: DeviceKeyboard._keySize,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(15),
        color: color,
        border: focused
            ? Border.all(color: const Color(0xFF1F2937), width: 3)
            : Border.all(color: translucent ? Colors.white.withValues(alpha: 0.75) : const Color(0xFFD5D9DE)),
        boxShadow: [
          BoxShadow(color: const Color(0xFFC7CCD2), offset: Offset(0, pressed ? 2 : 6)),
          BoxShadow(color: const Color(0x33000000), blurRadius: pressed ? 4 : 9, offset: Offset(0, pressed ? 3 : 9)),
          if (glow != null) BoxShadow(color: glow!, blurRadius: 22, spreadRadius: 1),
        ],
      ),
      alignment: Alignment.center,
      child: child,
    );
  }
}

/// Drawn ✛ axis cross (font glyphs like U+271B don't render on iOS).
class _AxisCross extends StatelessWidget {
  final bool active;
  const _AxisCross({required this.active});
  @override
  Widget build(BuildContext context) {
    final sw = active ? Colors.white.withValues(alpha: 0.25) : Colors.white.withValues(alpha: 0.55);
    final arm = active ? Colors.white.withValues(alpha: 0.9) : const Color(0xFF9AA4B5);
    return Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(6), color: sw),
      alignment: Alignment.center,
      child: SizedBox(
        width: 15,
        height: 15,
        child: Stack(alignment: Alignment.center, children: [
          Container(width: 15, height: 2.4, color: arm),
          Container(width: 2.4, height: 15, color: arm),
        ]),
      ),
    );
  }
}

/// The ◎✓ accept glyph, composed reliably from icons.
class _AcceptGlyph extends StatelessWidget {
  const _AcceptGlyph();
  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      width: 30,
      height: 26,
      child: Stack(alignment: Alignment.center, children: [
        Icon(Icons.circle_outlined, color: Color(0xFF3A3F47), size: 24),
        Icon(Icons.check, color: Color(0xFF3A3F47), size: 15),
      ]),
    );
  }
}

class _Screw extends StatelessWidget {
  const _Screw();
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 14,
      height: 14,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(center: Alignment(-0.3, -0.4), colors: [Color(0xFF4A4D52), Color(0xFF17191D)]),
      ),
      alignment: Alignment.center,
      child: Container(width: 8, height: 2, color: const Color(0xFF0A0B0D)),
    );
  }
}


class _TopMark extends StatelessWidget {
  const _TopMark();
  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.only(bottom: 2),
      child: Icon(Icons.arrow_upward, size: 12, color: Color(0xFF99A0A9)),
    );
  }
}

/// A tappable key with press-down travel + rebound. `builder(pressed)` renders
/// the face for the current pressed state. `travel:false` disables the visual
/// offset (used by the flush touch sensor).
class _PressableKey extends StatefulWidget {
  final Widget Function(bool pressed) builder;
  final VoidCallback? onTap;
  final void Function(Offset local)? onTapAt;
  final VoidCallback? onLongPress;
  final bool pulse;
  final bool travel;
  const _PressableKey({
    required this.builder,
    this.onTap,
    this.onTapAt,
    this.onLongPress,
    this.pulse = false,
    this.travel = true,
  });
  @override
  State<_PressableKey> createState() => _PressableKeyState();
}

class _PressableKeyState extends State<_PressableKey> {
  bool _pressed = false;
  void _set(bool v) {
    if (widget.travel && mounted) setState(() => _pressed = v);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _set(true),
      onTapUp: (d) {
        _set(false);
        widget.onTap?.call();
        widget.onTapAt?.call(d.localPosition);
      },
      onTapCancel: () => _set(false),
      onLongPress: widget.onLongPress,
      child: widget.builder(_pressed),
    );
  }
}

/// A press-and-hold key (PTT): pressed while the finger is down.
class _HoldKey extends StatefulWidget {
  final Widget Function(bool pressed) builder;
  final VoidCallback onStart;
  final VoidCallback onEnd;
  const _HoldKey({required this.builder, required this.onStart, required this.onEnd});
  @override
  State<_HoldKey> createState() => _HoldKeyState();
}

class _HoldKeyState extends State<_HoldKey> {
  bool _held = false;
  void _start() {
    if (_held) return;
    setState(() => _held = true);
    widget.onStart();
  }

  void _end() {
    if (!_held) return;
    setState(() => _held = false);
    widget.onEnd();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _start(),
      onTapUp: (_) => _end(),
      onTapCancel: _end,
      child: widget.builder(_held),
    );
  }
}
