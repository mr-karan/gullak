import 'package:flutter/material.dart';

import 'quick_entry_sheet.dart';

/// Single entry point for opening the Quick Entry sheet — used by the
/// FAB to add new entries and by the activity rows to edit existing ones.
/// Keeping this in one place means the surface is always the same form.
Future<void> openQuickEntry(
  BuildContext context, {
  String? editingTransactionId,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    useRootNavigator: true,
    builder: (ctx) => Material(
      color: Theme.of(ctx).colorScheme.surfaceContainerHigh,
      child: QuickEntrySheet(editingTransactionId: editingTransactionId),
    ),
  );
}
