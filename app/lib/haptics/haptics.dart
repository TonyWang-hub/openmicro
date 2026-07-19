/// 触感引擎 — 本 App 的核心卖点（"体感拉满"）。
///
/// 通过 platform channel `com.microtoy/haptics` 调用原生实现：
/// - iOS: CoreHaptics（`CHHapticEngine`），不支持的机型回退 `UIImpactFeedbackGenerator`
/// - Android: `VibrationEffect`（API 26+ predefined/oneShot/waveform），更老机型回退
///   `Vibrator.vibrate(ms)`
///
/// 任何原生调用失败（未实现的方法、平台不支持、插件未注册等）都会静默降级到
/// Flutter 自带的 `HapticFeedback`；如果连 `HapticFeedback` 也失败，则整体
/// 静默 no-op —— 触感永远不应该让上层业务代码抛异常。
library;

import 'package:flutter/services.dart';

/// 触感语义种类，映射到原生实现里的具体波形/瞬态设计。
enum HapticKind {
  /// 轻点：普通按键触感。
  tap,

  /// 键按下：比 [tap] 稍重，用于"确定/提交"类按键。
  press,

  /// 旋钮棘轮：极短的一格刻度感。
  detent,

  /// needs_input 提醒：双击顿挫，用于提示需要处理。
  alert,

  /// 审批成功：更饱满的确认感。
  success,
}

/// 触感引擎单例。
///
/// 用法：
/// ```dart
/// await Haptics.instance.init();
/// Haptics.instance.tap();
/// ```
class Haptics {
  Haptics._internal();

  static final Haptics instance = Haptics._internal();

  static const MethodChannel _channel = MethodChannel('com.microtoy/haptics');

  bool _nativeReady = false;
  bool _initAttempted = false;

  /// 原生触感引擎是否已就绪（供调试/设置页展示用，不影响触发逻辑——
  /// 触发时永远按需自动降级，不依赖这个标志位做前置判断）。
  bool get isNativeReady => _nativeReady;

  /// 初始化原生触感引擎（iOS 侧会预热 `CHHapticEngine`）。
  ///
  /// 允许多次调用；只有第一次真正触发原生初始化。任何失败都被吞掉——
  /// 后续调用 [tap] 等方法时会自动走 `HapticFeedback` 降级路径。
  Future<void> init() async {
    if (_initAttempted) return;
    _initAttempted = true;
    try {
      final result = await _channel.invokeMethod<bool>('init');
      _nativeReady = result ?? true;
    } catch (_) {
      _nativeReady = false;
    }
  }

  /// 轻点触感：普通按键。
  Future<void> tap() => _fire(HapticKind.tap);

  /// 键按下触感：比 [tap] 稍重，确定/提交类按键。
  Future<void> press() => _fire(HapticKind.press);

  /// 旋钮棘轮触感：极短的一格刻度感。
  Future<void> detent() => _fire(HapticKind.detent);

  /// needs_input 提醒触感：双击顿挫。
  Future<void> alert() => _fire(HapticKind.alert);

  /// 审批成功触感。
  Future<void> success() => _fire(HapticKind.success);

  Future<void> _fire(HapticKind kind) async {
    final methodName = _methodNameFor(kind);
    try {
      await _channel.invokeMethod(methodName);
      return;
    } catch (_) {
      // 原生不可用/失败 —— 降级到 Flutter 内建触感反馈。
    }
    await _fallback(kind);
  }

  String _methodNameFor(HapticKind kind) {
    switch (kind) {
      case HapticKind.tap:
        return 'tap';
      case HapticKind.press:
        return 'press';
      case HapticKind.detent:
        return 'detent';
      case HapticKind.alert:
        return 'alert';
      case HapticKind.success:
        return 'success';
    }
  }

  Future<void> _fallback(HapticKind kind) async {
    try {
      switch (kind) {
        case HapticKind.tap:
          await HapticFeedback.lightImpact();
          break;
        case HapticKind.press:
          await HapticFeedback.mediumImpact();
          break;
        case HapticKind.detent:
          await HapticFeedback.selectionClick();
          break;
        case HapticKind.alert:
          // 双击顿挫：两次中等冲击，之间留一个短间隔。
          await HapticFeedback.mediumImpact();
          await Future<void>.delayed(const Duration(milliseconds: 90));
          await HapticFeedback.mediumImpact();
          break;
        case HapticKind.success:
          await HapticFeedback.heavyImpact();
          break;
      }
    } catch (_) {
      // 彻底不可用（例如桌面/测试环境）—— 静默 no-op，绝不向上抛。
    }
  }
}
