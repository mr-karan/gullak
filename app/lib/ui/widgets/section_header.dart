import 'package:flutter/material.dart';

import '../theme.dart';

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.text, {this.trailing, super.key});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(text.toUpperCase(), style: eyebrowStyle(context)),
          ),
          ?trailing,
        ],
      ),
    );
  }
}
