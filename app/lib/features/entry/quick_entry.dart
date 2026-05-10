import 'package:flutter/material.dart';

import '../inbox/data/sms_repository.dart';
import 'quick_entry_sheet.dart';

/// Single entry point for opening the Quick Entry sheet — used by the
/// FAB to add new entries, by the activity rows to edit existing ones,
/// and by the Inbox Confirm flow to review-and-save an SMS-derived
/// transaction.
Future<void> openQuickEntry(
  BuildContext context, {
  String? editingTransactionId,
  String? initialNote,
  SmsTransactionDraft? smsDraft,
  Future<void> Function(String transactionId)? onCreated,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    useRootNavigator: true,
    builder: (ctx) => Material(
      color: Theme.of(ctx).colorScheme.surfaceContainerHigh,
      child: QuickEntrySheet(
        editingTransactionId: editingTransactionId,
        initialNote: initialNote,
        smsDraft: smsDraft,
        onCreated: onCreated,
      ),
    ),
  );
}
