import CoreHaptics
import Flutter
import UIKit

/// 触感引擎的 iOS 原生实现。
///
/// 优先使用 CoreHaptics（`CHHapticEngine`）合成精细波形；机型不支持时
/// （`CHHapticEngine.capabilitiesForHardware().supportsHaptics == false`）
/// 回退到 `UIImpactFeedbackGenerator` / `UISelectionFeedbackGenerator` /
/// `UINotificationFeedbackGenerator`。
///
/// 任何异常都在方法内部吞掉并通过 `result(false)` / `result(FlutterError)` 上报，
/// Dart 侧收到失败会自行降级到 `HapticFeedback`，这里不需要重复兜底。
public class HapticsPlugin: NSObject, FlutterPlugin {

  private var engine: CHHapticEngine?
  private let supportsHaptics: Bool

  // 预热好的 impact/selection/notification generator，避免每次触发时新建。
  private let lightImpact = UIImpactFeedbackGenerator(style: .light)
  private let mediumImpact = UIImpactFeedbackGenerator(style: .medium)
  private let heavyImpact = UIImpactFeedbackGenerator(style: .heavy)
  private let selection = UISelectionFeedbackGenerator()
  private let notification = UINotificationFeedbackGenerator()

  override init() {
    self.supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics
    super.init()
  }

  public static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "com.microtoy/haptics",
      binaryMessenger: registrar.messenger()
    )
    let instance = HapticsPlugin()
    registrar.addMethodCallDelegate(instance, channel: channel)
  }

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "init":
      startEngineIfNeeded(result: result)
    case "tap":
      play(pattern: tapPattern(), fallback: { self.lightImpact.impactOccurred() }, result: result)
    case "press":
      play(pattern: pressPattern(), fallback: { self.mediumImpact.impactOccurred() }, result: result)
    case "detent":
      play(pattern: detentPattern(), fallback: { self.selection.selectionChanged() }, result: result)
    case "alert":
      play(pattern: alertPattern(), fallback: { self.playAlertFallback() }, result: result)
    case "success":
      play(pattern: successPattern(), fallback: { self.notification.notificationOccurred(.success) }, result: result)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  // MARK: - Engine lifecycle

  private func startEngineIfNeeded(result: @escaping FlutterResult) {
    guard supportsHaptics else {
      result(false)
      return
    }
    if engine != nil {
      result(true)
      return
    }
    do {
      let newEngine = try CHHapticEngine()
      newEngine.resetHandler = { [weak self] in
        try? self?.engine?.start()
      }
      newEngine.stoppedHandler = { [weak self] _ in
        try? self?.engine?.start()
      }
      try newEngine.start()
      engine = newEngine
      result(true)
    } catch {
      engine = nil
      result(false)
    }
  }

  /// 播放一个 CoreHaptics pattern；不支持/失败时执行 `fallback`。
  /// `result` 总是被调用，成功传 true，走 fallback 或异常传 false，
  /// 让 Dart 侧的调用方也能感知（虽然当前 Dart 侧只依赖异常/非异常）。
  private func play(pattern: CHHapticPattern?, fallback: @escaping () -> Void, result: @escaping FlutterResult) {
    guard supportsHaptics, let pattern = pattern else {
      fallback()
      result(true)
      return
    }
    do {
      if engine == nil {
        engine = try CHHapticEngine()
        engine?.resetHandler = { [weak self] in try? self?.engine?.start() }
        engine?.stoppedHandler = { [weak self] _ in try? self?.engine?.start() }
      }
      try engine?.start()
      let player = try engine?.makePlayer(with: pattern)
      try player?.start(atTime: CHHapticTimeImmediate)
      result(true)
    } catch {
      fallback()
      result(true)
    }
  }

  private func playAlertFallback() {
    mediumImpact.impactOccurred()
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.09) {
      self.mediumImpact.impactOccurred()
    }
  }

  // MARK: - Patterns

  /// tap：单次短瞬态，轻。
  private func tapPattern() -> CHHapticPattern? {
    let intensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.55)
    let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5)
    let event = CHHapticEvent(eventType: .hapticTransient, parameters: [intensity, sharpness], relativeTime: 0)
    return try? CHHapticPattern(events: [event], parameters: [])
  }

  /// press：单次瞬态，比 tap 更重、更实（键按下确认感）。
  private func pressPattern() -> CHHapticPattern? {
    let intensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.9)
    let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.7)
    let event = CHHapticEvent(eventType: .hapticTransient, parameters: [intensity, sharpness], relativeTime: 0)
    return try? CHHapticPattern(events: [event], parameters: [])
  }

  /// detent：旋钮棘轮，极短、干脆的一格刻度感（低强度、高锐度）。
  private func detentPattern() -> CHHapticPattern? {
    let intensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.35)
    let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 1.0)
    let event = CHHapticEvent(eventType: .hapticTransient, parameters: [intensity, sharpness], relativeTime: 0)
    return try? CHHapticPattern(events: [event], parameters: [])
  }

  /// alert：needs_input 提醒，双击顿挫 —— 两个间隔约 100ms 的瞬态。
  private func alertPattern() -> CHHapticPattern? {
    let intensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.8)
    let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.6)
    let first = CHHapticEvent(eventType: .hapticTransient, parameters: [intensity, sharpness], relativeTime: 0)
    let second = CHHapticEvent(eventType: .hapticTransient, parameters: [intensity, sharpness], relativeTime: 0.1)
    return try? CHHapticPattern(events: [first, second], parameters: [])
  }

  /// success：审批成功 —— 一个瞬态确认 + 紧随其后的短促连续纹理，制造"落地"感。
  private func successPattern() -> CHHapticPattern? {
    let transientIntensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0)
    let transientSharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.6)
    let transient = CHHapticEvent(
      eventType: .hapticTransient,
      parameters: [transientIntensity, transientSharpness],
      relativeTime: 0
    )

    let continuousIntensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.5)
    let continuousSharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.3)
    let continuous = CHHapticEvent(
      eventType: .hapticContinuous,
      parameters: [continuousIntensity, continuousSharpness],
      relativeTime: 0.03,
      duration: 0.12
    )

    return try? CHHapticPattern(events: [transient, continuous], parameters: [])
  }
}
