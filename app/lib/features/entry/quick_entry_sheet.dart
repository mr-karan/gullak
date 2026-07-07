import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/clock.dart';
import '../../core/money.dart';
import '../../core/snackbars.dart';
import '../../state/providers.dart';
import '../../ui/app_sheet.dart';
import '../../ui/theme.dart';
import '../accounts/data/account_repository.dart';
import '../categories/category_form_dialog.dart';
import '../categories/category_visuals.dart';
import '../categories/data/category_repository.dart';
import '../inbox/data/sms_repository.dart';
import '../location/location_service.dart';
import '../payees/data/payee_repository.dart';
import '../tags/data/tag_repository.dart';
import '../transactions/data/transaction_repository.dart';
import 'ai_extractor.dart';
import 'entry_memory.dart';
import 'share_intake.dart';

part 'quick_entry_describe.dart';
part 'quick_entry_form.dart';
part 'quick_entry_skeleton.dart';

class QuickEntrySheet extends ConsumerStatefulWidget {
  const QuickEntrySheet({
    this.editingTransactionId,
    this.initialNote,
    this.smsDraft,
    this.onCreated,
    super.key,
  });

  /// When non-null, the sheet hydrates from this transaction and Save
  /// updates instead of inserting. Header copy and the trailing icon
  /// flip accordingly.
  final String? editingTransactionId;

  /// When non-null, the natural-language Type tab opens with this text
  /// already entered (e.g. an SMS body the user wants to log manually).
  /// Forces the Type tab to be the initial selection regardless of the
  /// last-used tab pref.
  final String? initialNote;

  /// When non-null, the Form tab opens pre-filled from an SMS-derived
  /// draft so the user only has to fill missing metadata (typically the
  /// category). The Type tab is suppressed in this mode.
  final SmsTransactionDraft? smsDraft;

  /// Called after a *new* transaction is saved (not on edit). The Inbox
  /// Confirm flow uses this to mark the SMS row accepted and link it
  /// to the freshly-created transaction id.
  final Future<void> Function(String transactionId)? onCreated;

  @override
  ConsumerState<QuickEntrySheet> createState() => _QuickEntrySheetState();
}

class _QuickEntrySheetState extends ConsumerState<QuickEntrySheet> {
  bool get _isEditing => widget.editingTransactionId != null;
  bool get _isSmsConfirm => widget.smsDraft != null;

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final keyboardOpen = mq.viewInsets.bottom > 0;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: mq.viewInsets.bottom),
        // SafeArea already accounts for the status bar — don't subtract
        // padding.top again or we lose ~60px and the keypad overflows
        // on smaller screens.
        child: SizedBox(
          height: mq.size.height * 0.92,
          child: Column(
            mainAxisSize: MainAxisSize.max,
            children: [
              _Header(
                title: _isEditing
                    ? 'Edit expense'
                    : _isSmsConfirm
                    ? 'Confirm from SMS'
                    : 'New expense',
                onCancel: () => Navigator.of(context).maybePop(),
                editingTransactionId: widget.editingTransactionId,
              ),
              Expanded(
                child: _FormTab(
                  editingTransactionId: widget.editingTransactionId,
                  smsDraft: widget.smsDraft,
                  initialNote: widget.initialNote,
                  onCreated: widget.onCreated,
                  keyboardOpen: keyboardOpen,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header({
    required this.title,
    required this.onCancel,
    required this.editingTransactionId,
  });

  final String title;
  final VoidCallback onCancel;
  final String? editingTransactionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isEditing = editingTransactionId != null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
      child: Row(
        children: [
          TextButton(onPressed: onCancel, child: const Text('Cancel')),
          const Spacer(),
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const Spacer(),
          if (isEditing)
            IconButton(
              tooltip: 'Delete',
              icon: const Icon(Icons.delete_outline),
              onPressed: () async {
                // Snapshot the InheritedWidget lookups *before* popping —
                // after pop our context is deactivated and using it for
                // ScaffoldMessenger.of trips _dependents.isEmpty asserts.
                final messenger = ScaffoldMessenger.of(context);
                final navigator = Navigator.of(context);
                final repo = ref.read(transactionRepoProvider);
                final snap = await repo.delete(editingTransactionId!);
                if (snap.isEmpty) return;
                navigator.maybePop();
                showTimedSnackBar(
                  messenger,
                  SnackBar(
                    content: const Text('Deleted'),
                    action: SnackBarAction(
                      label: 'Undo',
                      onPressed: () => repo.restore(snap),
                    ),
                  ),
                  duration: const Duration(seconds: 4),
                );
              },
            )
          else
            const SizedBox(width: 56),
        ],
      ),
    );
  }
}

/// Fire-and-forget location attach, kept off the save critical path so a slow
/// or failed GPS fix never blocks or breaks the save. Snapshots the
/// repo/service (not `ref`) because the sheet is usually disposed by the time
/// the fix returns.
void _attachLocationInBackground(
  LocationService service,
  TransactionRepository repo,
  String transactionId,
) {
  unawaited(() async {
    final loc = await service.capture();
    if (loc == null) return;
    await repo.update(
      transactionId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      locationName: loc.name,
    );
  }());
}

SnackBar _savedSnackBar(String label) {
  return SnackBar(
    content: Row(
      children: [
        const Icon(Icons.check_circle_outline, size: 20),
        const SizedBox(width: 12),
        Text(label),
      ],
    ),
    duration: const Duration(seconds: 2),
  );
}
