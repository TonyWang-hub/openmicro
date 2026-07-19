package com.microtoy.microtoy

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * 触感引擎的 Android 原生实现。
 *
 * API 26+ 用 [VibrationEffect]（predefined / createOneShot / createWaveform）合成
 * tap/press/detent/alert/success 五种触感；API < 26 回退到已废弃的
 * `Vibrator.vibrate(ms)` 单一时长震动。
 *
 * 任何异常（缺 VIBRATE 权限、设备无振动马达等）都通过 `result.error(...)`
 * 上报给 Dart 侧，Dart 侧收到失败会自动降级到 Flutter 内建 HapticFeedback，
 * 这里不需要重复兜底或静默吞掉。
 */
class HapticsPlugin private constructor(
    private val context: Context,
) : MethodChannel.MethodCallHandler {

    companion object {
        const val CHANNEL_NAME = "com.microtoy/haptics"

        /** 在 `MainActivity.configureFlutterEngine` 里调用以注册 channel。 */
        fun registerWith(messenger: BinaryMessenger, context: Context) {
            val channel = MethodChannel(messenger, CHANNEL_NAME)
            channel.setMethodCallHandler(HapticsPlugin(context.applicationContext))
        }
    }

    private val vibrator: Vibrator? by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            manager?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        try {
            when (call.method) {
                "init" -> result.success(vibrator?.hasVibrator() == true)
                "tap" -> {
                    tap()
                    result.success(true)
                }
                "press" -> {
                    press()
                    result.success(true)
                }
                "detent" -> {
                    detent()
                    result.success(true)
                }
                "alert" -> {
                    alert()
                    result.success(true)
                }
                "success" -> {
                    success()
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        } catch (e: Exception) {
            // 交给 Dart 侧的 catch 处理，走 HapticFeedback 降级路径。
            result.error("HAPTICS_FAILED", e.message, null)
        }
    }

    private fun requireVibrator(): Vibrator =
        vibrator ?: throw IllegalStateException("No vibrator service available")

    private fun vibrateOneShot(durationMs: Long, amplitude: Int) {
        val v = requireVibrator()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createOneShot(durationMs, amplitude))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(durationMs)
        }
    }

    private fun vibratePredefined(effectId: Int, fallbackMs: Long, fallbackAmplitude: Int) {
        val v = requireVibrator()
        when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ->
                v.vibrate(VibrationEffect.createPredefined(effectId))
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ->
                v.vibrate(VibrationEffect.createOneShot(fallbackMs, fallbackAmplitude))
            else -> {
                @Suppress("DEPRECATION")
                v.vibrate(fallbackMs)
            }
        }
    }

    private fun vibrateWaveform(timings: LongArray, amplitudes: IntArray) {
        val v = requireVibrator()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(timings.sum())
        }
    }

    /** tap：轻点，短促单次一击。 */
    private fun tap() {
        vibratePredefined(VibrationEffect.EFFECT_TICK, 12L, 110)
    }

    /** press：键按下，比 tap 更重的单次一击。 */
    private fun press() {
        vibratePredefined(VibrationEffect.EFFECT_HEAVY_CLICK, 20L, 190)
    }

    /** detent：旋钮棘轮，极短的刻度感（比 predefined click 更短、更轻）。 */
    private fun detent() {
        vibrateOneShot(8L, 90)
    }

    /** alert：needs_input 提醒，双击顿挫 —— 两段短震动之间留静音间隔。 */
    private fun alert() {
        vibrateWaveform(longArrayOf(0L, 40L, 90L, 40L), intArrayOf(0, 200, 0, 200))
    }

    /** success：审批成功 —— 一次确认瞬击 + 紧随的短促持续震动，制造"落地"感。 */
    private fun success() {
        vibrateWaveform(longArrayOf(0L, 30L, 20L, 90L), intArrayOf(0, 255, 0, 140))
    }
}
