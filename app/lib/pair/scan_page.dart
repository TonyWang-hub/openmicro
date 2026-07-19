/// Pairing QR scan page — reads the pairing URL printed by the Host's
/// `/pair` QR code (e.g. `http://192.168.31.248:7788/m?token=toy2026&live=1`)
/// and pops the raw scanned string back to the caller. The caller (currently
/// `ConnectScreen` in main.dart) is responsible for feeding it through
/// `parseTarget` — this page does no parsing itself, it's a dumb scanner.
library;

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../l10n/app_localizations.dart';

class ScanPage extends StatefulWidget {
  const ScanPage({super.key});

  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> {
  final MobileScannerController _controller = MobileScannerController();
  bool _handled = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    for (final barcode in capture.barcodes) {
      final raw = barcode.rawValue;
      if (raw != null && raw.isNotEmpty) {
        _handled = true;
        Navigator.of(context).pop(raw);
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(l10n.scanTitle),
      ),
      body: Stack(
        children: [
          MobileScanner(controller: _controller, onDetect: _onDetect),
          Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 32),
              child: Text(
                l10n.scanHint,
                style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
