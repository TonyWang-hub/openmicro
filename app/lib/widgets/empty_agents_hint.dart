import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';

/// Friendly empty-state shown above the keyboard when no agent session is
/// currently lit up, so a bank of idle gray keys doesn't read as "broken".
class EmptyAgentsHint extends StatelessWidget {
  const EmptyAgentsHint({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE0E3E8)),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, size: 18, color: Color(0xFF8A919B)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              AppLocalizations.of(context)!.emptyAgentsHint,
              style: const TextStyle(color: Color(0xFF5A6270), fontSize: 12.5),
            ),
          ),
        ],
      ),
    );
  }
}
