// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get connectSubtitle => 'Connect to your Host';

  @override
  String get pairUrlLabel => 'Pairing link (from the /pair QR code on your computer)';

  @override
  String get tokenLabel => 'Token (if not included in the link)';

  @override
  String get parseErrorText => 'Failed to parse: paste the pairing link (with ?token=), or fill in host:port + token';

  @override
  String get connectButton => 'Connect';

  @override
  String get scanButton => 'Scan QR';

  @override
  String get connectFooterHint => 'Your phone must be on the same LAN as the Host. You can also tap \"Scan QR\" to scan the /pair page QR code on your computer directly.';

  @override
  String get lcdConnecting => 'LIVE · Connecting…';

  @override
  String get lcdConnected => 'LIVE · Connected';

  @override
  String get lcdNoData => 'Connected but no data — check whether the Host is running / token is correct';

  @override
  String get lcdDisconnectedReconnecting => 'Disconnected, reconnecting…(lights held)';

  @override
  String needsInputAlert(String name) {
    return '$name needs you — select it, then press ◎✓/⊗';
  }

  @override
  String selectedAgent(String name) {
    return 'Selected $name (◎✓/⊗ only affects it)';
  }

  @override
  String get selectAgentFirstKey => 'Tap an Agent light to select it first, then press this key';

  @override
  String acceptSent(int slot) {
    return '◎✓ Accept → agent $slot';
  }

  @override
  String rejectSent(int slot) {
    return '⊗ Reject → agent $slot';
  }

  @override
  String quickSent(int slot) {
    return '⚡ Continue (Enter) → agent $slot';
  }

  @override
  String get newSessionHint => '💭 Start a new session on your computer with claude/codex — it lights up automatically';

  @override
  String get branchHint => '⤴ Branching is a computer-side action';

  @override
  String reasoningDisplay(String level) {
    return 'Reasoning level shown: $level (remote read-only)';
  }

  @override
  String get noActiveAgent => 'No active agent';

  @override
  String focusMoved(String name) {
    return 'Focus → $name';
  }

  @override
  String get scrollTop => '↟ Back to top';

  @override
  String get scrollLog => '↡ Scroll log';

  @override
  String get selectAgentFirstPtt => 'Tap an Agent light to select it first, then hold to speak';

  @override
  String get speechUnavailable => 'Speech recognition unavailable (simulator or not authorized) — use the keyboard instead';

  @override
  String get recording => '🎙 Recording…';

  @override
  String recordingLive(String words) {
    return '🎙 $words';
  }

  @override
  String get didntCatchThat => 'Didn\'t catch that';

  @override
  String promptSent(String words) {
    return '🎙 Sent: $words';
  }

  @override
  String get touchHint => 'Touch: beep (long-press to switch key sound)';

  @override
  String keySoundSwitched(String profile) {
    return 'Key sound → $profile';
  }

  @override
  String get keySoundPom => 'POM Crisp';

  @override
  String get keySoundPok => 'POK Silent';

  @override
  String get scanTitle => 'Scan pairing QR code';

  @override
  String get scanHint => 'Point at the QR code on your computer\'s /pair page';

  @override
  String get bannerConnecting => 'Connecting…';

  @override
  String get bannerDisconnected => 'Connection lost, reconnecting…';

  @override
  String get emptyAgentsHint => 'No active agent — opening claude/codex on your computer will light one up automatically';
}
