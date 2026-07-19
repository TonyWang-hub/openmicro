import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('zh')
  ];

  /// Subtitle under the app title on the connect screen
  ///
  /// In en, this message translates to:
  /// **'Connect to your Host'**
  String get connectSubtitle;

  /// Label for the pairing URL text field
  ///
  /// In en, this message translates to:
  /// **'Pairing link (from the /pair QR code on your computer)'**
  String get pairUrlLabel;

  /// Label for the token text field
  ///
  /// In en, this message translates to:
  /// **'Token (if not included in the link)'**
  String get tokenLabel;

  /// Error shown when the pairing input can't be parsed
  ///
  /// In en, this message translates to:
  /// **'Failed to parse: paste the pairing link (with ?token=), or fill in host:port + token'**
  String get parseErrorText;

  /// Label for the connect button
  ///
  /// In en, this message translates to:
  /// **'Connect'**
  String get connectButton;

  /// Label for the scan-QR button
  ///
  /// In en, this message translates to:
  /// **'Scan QR'**
  String get scanButton;

  /// Footer hint on the connect screen
  ///
  /// In en, this message translates to:
  /// **'Your phone must be on the same LAN as the Host. You can also tap \"Scan QR\" to scan the /pair page QR code on your computer directly.'**
  String get connectFooterHint;

  /// LCD status text while the initial connection is being established
  ///
  /// In en, this message translates to:
  /// **'LIVE · Connecting…'**
  String get lcdConnecting;

  /// LCD status text once connected
  ///
  /// In en, this message translates to:
  /// **'LIVE · Connected'**
  String get lcdConnected;

  /// LCD status text when connected but no state frame arrives in time
  ///
  /// In en, this message translates to:
  /// **'Connected but no data — check whether the Host is running / token is correct'**
  String get lcdNoData;

  /// LCD status text while reconnecting after a dropped connection
  ///
  /// In en, this message translates to:
  /// **'Disconnected, reconnecting…(lights held)'**
  String get lcdDisconnectedReconnecting;

  /// LCD alert when an agent slot transitions to needing input
  ///
  /// In en, this message translates to:
  /// **'{name} needs you — select it, then press ◎✓/⊗'**
  String needsInputAlert(String name);

  /// LCD feedback after tapping an agent light
  ///
  /// In en, this message translates to:
  /// **'Selected {name} (◎✓/⊗ only affects it)'**
  String selectedAgent(String name);

  /// LCD feedback when a command key is pressed with no focused agent
  ///
  /// In en, this message translates to:
  /// **'Tap an Agent light to select it first, then press this key'**
  String get selectAgentFirstKey;

  /// LCD feedback after sending the accept command
  ///
  /// In en, this message translates to:
  /// **'◎✓ Accept → agent {slot}'**
  String acceptSent(int slot);

  /// LCD feedback after sending the reject command
  ///
  /// In en, this message translates to:
  /// **'⊗ Reject → agent {slot}'**
  String rejectSent(int slot);

  /// LCD feedback after sending the quick-continue command
  ///
  /// In en, this message translates to:
  /// **'⚡ Continue (Enter) → agent {slot}'**
  String quickSent(int slot);

  /// LCD feedback for the new-session key
  ///
  /// In en, this message translates to:
  /// **'💭 Start a new session on your computer with claude/codex — it lights up automatically'**
  String get newSessionHint;

  /// LCD feedback for the branch key
  ///
  /// In en, this message translates to:
  /// **'⤴ Branching is a computer-side action'**
  String get branchHint;

  /// LCD feedback after turning the reasoning knob
  ///
  /// In en, this message translates to:
  /// **'Reasoning level shown: {level} (remote read-only)'**
  String reasoningDisplay(String level);

  /// LCD feedback when the joystick is used with no active agents
  ///
  /// In en, this message translates to:
  /// **'No active agent'**
  String get noActiveAgent;

  /// LCD feedback after moving focus with the joystick
  ///
  /// In en, this message translates to:
  /// **'Focus → {name}'**
  String focusMoved(String name);

  /// LCD feedback for joystick up
  ///
  /// In en, this message translates to:
  /// **'↟ Back to top'**
  String get scrollTop;

  /// LCD feedback for joystick down
  ///
  /// In en, this message translates to:
  /// **'↡ Scroll log'**
  String get scrollLog;

  /// LCD feedback when push-to-talk is started with no focused agent
  ///
  /// In en, this message translates to:
  /// **'Tap an Agent light to select it first, then hold to speak'**
  String get selectAgentFirstPtt;

  /// LCD feedback when speech recognition isn't available
  ///
  /// In en, this message translates to:
  /// **'Speech recognition unavailable (simulator or not authorized) — use the keyboard instead'**
  String get speechUnavailable;

  /// LCD feedback while push-to-talk is recording
  ///
  /// In en, this message translates to:
  /// **'🎙 Recording…'**
  String get recording;

  /// LCD live partial-transcript feedback while push-to-talk is recording
  ///
  /// In en, this message translates to:
  /// **'🎙 {words}'**
  String recordingLive(String words);

  /// LCD feedback when push-to-talk captured no words
  ///
  /// In en, this message translates to:
  /// **'Didn\'t catch that'**
  String get didntCatchThat;

  /// LCD feedback after sending a voice-dictated prompt
  ///
  /// In en, this message translates to:
  /// **'🎙 Sent: {words}'**
  String promptSent(String words);

  /// LCD feedback for a plain touch key press
  ///
  /// In en, this message translates to:
  /// **'Touch: beep (long-press to switch key sound)'**
  String get touchHint;

  /// LCD feedback after switching the key sound profile
  ///
  /// In en, this message translates to:
  /// **'Key sound → {profile}'**
  String keySoundSwitched(String profile);

  /// Name of the POM key sound profile
  ///
  /// In en, this message translates to:
  /// **'POM Crisp'**
  String get keySoundPom;

  /// Name of the POK key sound profile
  ///
  /// In en, this message translates to:
  /// **'POK Silent'**
  String get keySoundPok;

  /// AppBar title on the QR scan page
  ///
  /// In en, this message translates to:
  /// **'Scan pairing QR code'**
  String get scanTitle;

  /// Hint text overlaid on the QR scan page
  ///
  /// In en, this message translates to:
  /// **'Point at the QR code on your computer\'s /pair page'**
  String get scanHint;

  /// Connection banner text while connecting
  ///
  /// In en, this message translates to:
  /// **'Connecting…'**
  String get bannerConnecting;

  /// Connection banner text while disconnected and reconnecting
  ///
  /// In en, this message translates to:
  /// **'Connection lost, reconnecting…'**
  String get bannerDisconnected;

  /// Empty-state hint shown above the keyboard when no agent slots are active
  ///
  /// In en, this message translates to:
  /// **'No active agent — opening claude/codex on your computer will light one up automatically'**
  String get emptyAgentsHint;
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['en', 'zh'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {


  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en': return AppLocalizationsEn();
    case 'zh': return AppLocalizationsZh();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.'
  );
}
