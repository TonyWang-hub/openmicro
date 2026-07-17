import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:microtoy/audio/keysound.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('KeySound', () {
    test('init is idempotent and defaults to the pom profile', () async {
      final sound = KeySound();
      await sound.init();
      expect(sound.profile, 'pom');
      await sound.init(); // second call must not throw / must not reset
    });

    test('setProfile switches between pom and pok, ignores unknown values',
        () async {
      final sound = KeySound();
      await sound.init();

      await sound.setProfile('pok');
      expect(sound.profile, 'pok');

      await sound.setProfile('pom');
      expect(sound.profile, 'pom');

      await sound.setProfile('bogus');
      expect(sound.profile, 'pom'); // unchanged
    });

    test('setProfile persists the choice via shared_preferences', () async {
      final sound = KeySound();
      await sound.init();
      await sound.setProfile('pok');

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('keysound_profile'), 'pok');

      // restore default for later tests in this run (singleton state).
      await sound.setProfile('pom');
    });

    test(
        'keyDown/keyUp/knobTick/pttStart/pttStop are callable for every kind '
        'without throwing', () async {
      final sound = KeySound();
      await sound.init();

      for (final kind in ['agent', 'cmd', 'mic', 'touch']) {
        expect(() => sound.keyDown(kind), returnsNormally);
        expect(() => sound.keyUp(kind), returnsNormally);
      }
      expect(() => sound.knobTick(), returnsNormally);
      expect(() => sound.pttStart(), returnsNormally);
      expect(() => sound.pttStop(), returnsNormally);

      // Unknown kind must be a safe no-op, never a crash.
      expect(() => sound.keyDown('unknown'), returnsNormally);
      expect(() => sound.keyUp('unknown'), returnsNormally);
    });

    test('synthesizes non-empty valid WAV/PCM buffers for both profiles',
        () async {
      final sound = KeySound();
      await sound.init();

      for (final profile in ['pom', 'pok']) {
        await sound.setProfile(profile);
        final buffers = sound.debugBuffers;

        // One buffer per kind x down/up, plus knob tick + ptt start/stop.
        expect(buffers.length, 4 * 2 + 3);

        for (final entry in buffers.entries) {
          final bytes = entry.value;
          expect(bytes, isNotEmpty,
              reason: '${entry.key} produced empty PCM buffer');
          // Bigger than the 44-byte WAV header — actual audio data present.
          expect(bytes.length, greaterThan(44));
          expect(String.fromCharCodes(bytes.sublist(0, 4)), 'RIFF');
          expect(String.fromCharCodes(bytes.sublist(8, 12)), 'WAVE');
        }
      }

      await sound.setProfile('pom'); // restore default
    });
  });
}
