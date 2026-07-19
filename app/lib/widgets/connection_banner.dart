import 'package:flutter/material.dart';

import '../keyboard/device.dart';
import '../l10n/app_localizations.dart';
import '../model/slot.dart';

/// Thin status banner shown above the keyboard whenever the Host connection
/// isn't fully live. Collapses to nothing once `connection == connected` so
/// a healthy session isn't cluttered with status chrome.
class ConnectionBanner extends StatelessWidget {
  final LiveConnection connection;
  const ConnectionBanner({super.key, required this.connection});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final String? text;
    final Color color;
    switch (connection) {
      case LiveConnection.connecting:
        text = l10n.bannerConnecting;
        color = DeviceKeyboard.needs;
        break;
      case LiveConnection.disconnected:
        text = l10n.bannerDisconnected;
        color = DeviceKeyboard.error;
        break;
      case LiveConnection.connected:
        text = null;
        color = Colors.transparent;
        break;
    }
    return AnimatedSize(
      duration: const Duration(milliseconds: 150),
      child:
          text == null
              ? const SizedBox(width: double.infinity)
              : Container(
                width: double.infinity,
                color: color,
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  text,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
    );
  }
}
