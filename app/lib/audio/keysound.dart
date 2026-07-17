/// Mechanical-keyboard sound engine for the pointer/keyboard rig (see
/// docs/specs/2026-07-18-native-app.md § 音效).
///
/// Design: all click/tick/chirp sounds are **synthesized at runtime as raw
/// 16-bit PCM mono WAV byte buffers** (see [_synthesize], [_synthChirp],
/// [_encodeWav]) — no bundled audio assets, no extra dependency needed for
/// the *synthesis* half of this engine.
///
/// ## Dependency needed for the *playback* half
///
/// Pure Flutter (`dart:*` + the `flutter` SDK) has no built-in API to play
/// an in-memory PCM/WAV byte buffer with low latency. [_play] below is a
/// deliberate **no-op placeholder** — it is fully callable (so `analyze`
/// and this file's tests pass with zero new deps) but does not make sound
/// yet. To make it actually play, add ONE of:
///
/// - `flutter_soloud` (recommended, and what the spec names first): native
///   mixing engine built for exactly this — many overlapping short one-shot
///   sounds with low trigger latency (rapid key-repeat won't cut previous
///   clicks off), and it can load raw PCM from memory directly
///   (no temp file). Heavier (ships a native lib via FFI).
/// - `audioplayers`: lighter, pure-Dart-facing API, supports playing from
///   `BytesSource` (no temp file either). Simpler to wire, but a single
///   `AudioPlayer` instance can only play one clip at a time — needs a
///   small pool of instances to avoid clipped/dropped sounds under fast
///   key-repeat (e.g. rolling PTT chatter).
///
/// Either works; `flutter_soloud` is the safer choice given this is a
/// keyboard — presses can overlap faster than a single-instance player
/// can recover.
library;

import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Sound profile: `pom` (清脆 — bright/crisp click) or `pok` (静音闷 —
/// quiet/muffled thock).
class KeySound {
  KeySound._internal();
  static final KeySound _instance = KeySound._internal();
  factory KeySound() => _instance;

  static const String _prefsKey = 'keysound_profile';
  static const Set<String> _validProfiles = {'pom', 'pok'};
  static const int _sampleRate = 44100;
  static const List<String> _kinds = ['agent', 'cmd', 'mic', 'touch'];

  // Distinct pitch per key "kind" so agent/cmd/mic/touch are tell-apart-able
  // even within the same profile.
  static const Map<String, double> _kindFreqMul = {
    'agent': 1.0,
    'cmd': 1.15,
    'mic': 0.85,
    'touch': 1.3,
  };

  String _profile = 'pom';
  bool _initialized = false;
  SharedPreferences? _prefs;

  /// Synthesized WAV buffers keyed by `"<profile>:<soundId>"`. Rebuilt by
  /// [init] / [setProfile]. Exposed read-only for tests and for whatever
  /// wires in the real audio backend (see file doc comment above).
  final Map<String, Uint8List> _buffers = {};

  @visibleForTesting
  Map<String, Uint8List> get debugBuffers => Map.unmodifiable(_buffers);

  /// Current profile: `'pom'` or `'pok'`.
  String get profile => _profile;

  /// Loads the persisted profile (defaults to `'pom'`) and pre-synthesizes
  /// every sound for it. Safe to call more than once (idempotent) and safe
  /// to call even if `shared_preferences` platform bindings are not ready
  /// (falls back to the in-memory default).
  Future<void> init() async {
    if (_initialized) return;
    try {
      _prefs = await SharedPreferences.getInstance();
      final saved = _prefs?.getString(_prefsKey);
      if (saved != null && _validProfiles.contains(saved)) {
        _profile = saved;
      }
    } catch (_) {
      // No platform bindings (e.g. a bare `dart test`) — keep the default
      // profile and skip persistence; never throw out of init().
    }
    _regenerate();
    _initialized = true;
  }

  /// Switches profile ('pom'/'pok'), re-synthesizes all sounds for it, and
  /// persists the choice. Unknown profile strings are ignored (no-op).
  Future<void> setProfile(String p) async {
    if (!_validProfiles.contains(p)) return;
    _profile = p;
    _regenerate();
    try {
      _prefs ??= await SharedPreferences.getInstance();
      await _prefs?.setString(_prefsKey, p);
    } catch (_) {
      // Persistence best-effort only; in-memory profile switch still took.
    }
  }

  /// kind: 'agent'|'cmd'|'mic'|'touch'. Unknown kinds are a safe no-op.
  void keyDown(String kind) => _trigger('${kind}_down');

  /// kind: 'agent'|'cmd'|'mic'|'touch'. Unknown kinds are a safe no-op.
  void keyUp(String kind) => _trigger('${kind}_up');

  /// Short ratchet-like tick for the jog knob detent.
  void knobTick() => _trigger('knob_tick');

  /// Rising chirp marking push-to-talk engaging.
  void pttStart() => _trigger('ptt_start');

  /// Falling chirp marking push-to-talk releasing.
  void pttStop() => _trigger('ptt_stop');

  void _trigger(String soundId) {
    final bytes = _buffers['$_profile:$soundId'];
    if (bytes == null) return; // not (yet) initialized / unknown id — no-op
    _play(bytes);
  }

  /// TODO(playback-backend): wire a real audio player here once a
  /// dependency is added (see file-level doc comment). Left as a no-op so
  /// the whole engine is callable/testable without one.
  void _play(Uint8List wavBytes) {
    // Intentionally empty placeholder.
  }

  void _regenerate() {
    _buffers.clear();
    for (final kind in _kinds) {
      _buffers['$_profile:${kind}_down'] =
          _synthKeyClick(kind: kind, down: true);
      _buffers['$_profile:${kind}_up'] =
          _synthKeyClick(kind: kind, down: false);
    }
    _buffers['$_profile:knob_tick'] = _synthKnobTick();
    _buffers['$_profile:ptt_start'] = _synthChirp(rising: true);
    _buffers['$_profile:ptt_stop'] = _synthChirp(rising: false);
  }

  // ---------------------------------------------------------------------
  // Synthesis
  // ---------------------------------------------------------------------

  Uint8List _synthKeyClick({required String kind, required bool down}) {
    final bright = _profile == 'pom';
    final freqMul = _kindFreqMul[kind] ?? 1.0;
    final baseFreq = bright ? 2000.0 : 220.0;
    final toneFreq = baseFreq * freqMul * (down ? 1.0 : 1.08);
    final toneDecayMs = bright ? 12.0 : 40.0;
    final noiseDecayMs = bright ? 8.0 : 28.0;
    final noiseMix = bright ? 0.5 : 0.3;
    // Lower alpha = heavier one-pole lowpass = duller/muffled ('pok').
    final lowpassAlpha = bright ? 0.9 : 0.25;
    final baseAmp = bright ? 0.8 : 0.35;
    final amplitude = down ? baseAmp : baseAmp * 0.6;
    final durationMs = (bright ? 30.0 : 60.0) * (down ? 1.0 : 0.7);

    return _synthesize(
      toneFreq: toneFreq,
      toneDecayMs: toneDecayMs,
      noiseDecayMs: noiseDecayMs,
      noiseMix: noiseMix,
      lowpassAlpha: lowpassAlpha,
      amplitude: amplitude,
      durationMs: durationMs,
    );
  }

  Uint8List _synthKnobTick() {
    final bright = _profile == 'pom';
    return _synthesize(
      toneFreq: bright ? 3200.0 : 900.0,
      toneDecayMs: 4.0,
      noiseDecayMs: 4.0,
      noiseMix: 0.7,
      lowpassAlpha: bright ? 0.95 : 0.4,
      amplitude: bright ? 0.5 : 0.25,
      durationMs: 10.0,
    );
  }

  /// Percussive "tone + filtered noise" click, shared by key clicks and the
  /// knob tick. Both layers decay independently (exponential envelopes) so
  /// the noise burst can die out faster/slower than the tonal body.
  Uint8List _synthesize({
    required double toneFreq,
    required double toneDecayMs,
    required double noiseDecayMs,
    required double noiseMix,
    required double lowpassAlpha,
    required double amplitude,
    required double durationMs,
  }) {
    final n = _sampleCount(durationMs);
    final rnd = math.Random(toneFreq.toInt() ^ n);
    final noise = Float64List(n);
    for (var i = 0; i < n; i++) {
      noise[i] = rnd.nextDouble() * 2 - 1;
    }
    final filtered = _lowpass(noise, lowpassAlpha);

    final toneTau = toneDecayMs / 1000;
    final noiseTau = noiseDecayMs / 1000;
    final samples = Float64List(n);
    for (var i = 0; i < n; i++) {
      final t = i / _sampleRate;
      final toneEnv = math.exp(-t / toneTau);
      final noiseEnv = math.exp(-t / noiseTau);
      final tone =
          math.sin(2 * math.pi * toneFreq * t) * toneEnv * (1 - noiseMix);
      final noiseSample = filtered[i] * noiseEnv * noiseMix;
      samples[i] = (tone + noiseSample) * amplitude;
    }
    return _encodeWav(samples);
  }

  /// Short frequency-swept sine ("chirp") for PTT start/stop — rising for
  /// engage, falling for release.
  Uint8List _synthChirp({required bool rising}) {
    final bright = _profile == 'pom';
    final double f0;
    final double f1;
    if (bright) {
      f0 = rising ? 900.0 : 1400.0;
      f1 = rising ? 1600.0 : 700.0;
    } else {
      f0 = rising ? 260.0 : 380.0;
      f1 = rising ? 420.0 : 200.0;
    }
    final durationMs = bright ? 90.0 : 130.0;
    final amplitude = bright ? 0.55 : 0.3;

    final n = _sampleCount(durationMs);
    final samples = Float64List(n);
    final decayTau = (durationMs / 1000) / 2.5;
    final attackSamples = math.max(1, (n * 0.05).round());
    double phase = 0;
    for (var i = 0; i < n; i++) {
      final t = i / _sampleRate;
      final frac = n <= 1 ? 0.0 : i / (n - 1);
      final freq = f0 + (f1 - f0) * frac;
      phase += 2 * math.pi * freq / _sampleRate;
      final attack = i >= attackSamples ? 1.0 : i / attackSamples;
      final env = math.exp(-t / decayTau) * attack;
      samples[i] = math.sin(phase) * env * amplitude;
    }
    return _encodeWav(samples);
  }

  int _sampleCount(double durationMs) {
    final raw = ((_sampleRate * durationMs) / 1000).round();
    return math.max(8, math.min(_sampleRate, raw));
  }

  /// One-pole IIR lowpass; `alpha` in (0,1]. Smaller alpha = duller/more
  /// muffled (used for the 'pok' profile), alpha close to 1 = ~unfiltered
  /// (crisp 'pom').
  List<double> _lowpass(List<double> x, double alpha) {
    final y = List<double>.filled(x.length, 0);
    var prev = 0.0;
    for (var i = 0; i < x.length; i++) {
      prev = prev + alpha * (x[i] - prev);
      y[i] = prev;
    }
    return y;
  }

  // ---------------------------------------------------------------------
  // WAV encoding (16-bit PCM mono)
  // ---------------------------------------------------------------------

  Uint8List _encodeWav(List<double> samples) {
    final n = samples.length;
    final dataSize = n * 2;
    final bytes = Uint8List(44 + dataSize);
    final bd = ByteData.view(bytes.buffer);

    void writeAscii(int offset, String s) {
      for (var i = 0; i < s.length; i++) {
        bytes[offset + i] = s.codeUnitAt(i);
      }
    }

    writeAscii(0, 'RIFF');
    bd.setUint32(4, 36 + dataSize, Endian.little);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    bd.setUint32(16, 16, Endian.little); // fmt chunk size
    bd.setUint16(20, 1, Endian.little); // PCM
    bd.setUint16(22, 1, Endian.little); // mono
    bd.setUint32(24, _sampleRate, Endian.little);
    bd.setUint32(28, _sampleRate * 2, Endian.little); // byte rate
    bd.setUint16(32, 2, Endian.little); // block align
    bd.setUint16(34, 16, Endian.little); // bits per sample
    writeAscii(36, 'data');
    bd.setUint32(40, dataSize, Endian.little);

    var offset = 44;
    for (final s in samples) {
      final clamped = s.clamp(-1.0, 1.0);
      final v = (clamped * 32767).round();
      bd.setInt16(offset, v, Endian.little);
      offset += 2;
    }

    return bytes;
  }
}
