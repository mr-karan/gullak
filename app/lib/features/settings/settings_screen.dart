import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/build_info.dart';
import '../../core/notification_service.dart';
import '../../core/snackbars.dart';
import '../../data/ai/pi_ai_client.dart';
import '../../data/sms/llm_sms_parser.dart';
import '../../data/sms/sms_pipeline.dart';
import '../../data/sms/sms_reader.dart';
import '../../state/providers.dart';
import '../../sync/sync_service.dart';
import '../../sync/sync_status.dart';
import '../backup/backup_service.dart';
import '../backup/file_pick.dart';
import '../inbox/data/sms_repository.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = watchPrefs(ref);
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          const _SectionHeader('Currency'),
          ListTile(
            leading: const Icon(Icons.currency_exchange),
            title: const Text('Symbol'),
            trailing: Text(prefs.currencySymbol),
            onTap: () => _editSymbol(context, ref),
          ),
          ListTile(
            leading: const Icon(Icons.numbers),
            title: const Text('Minor digits'),
            subtitle: Text('${prefs.currencyMinorDigits}'),
            onTap: () => _editMinorDigits(context, ref),
          ),
          const _SectionHeader('SMS'),
          FutureBuilder<String?>(
            future: ref.read(secureStoreProvider).readSyncBaseUrl(),
            builder: (_, snap) {
              final syncConfigured =
                  Platform.isAndroid && (snap.data?.trim().isNotEmpty ?? false);
              return SwitchListTile(
                secondary: const Icon(Icons.sms_outlined),
                title: const Text('Read transactional SMS'),
                subtitle: Text(
                  !Platform.isAndroid
                      ? 'Available on Android only.'
                      : !syncConfigured
                      ? 'Configure Sync server first — SMS parsing runs there.'
                      : 'Reads only bank/transactional SMS. Everything else is ignored.',
                ),
                value: prefs.smsEnabled && syncConfigured,
                onChanged: !syncConfigured
                    ? null
                    : (v) => _toggleSms(context, ref, v),
              );
            },
          ),
          if (Platform.isAndroid)
            ListTile(
              leading: const Icon(Icons.delete_sweep_outlined),
              title: const Text('Clear SMS Inbox state'),
              subtitle: const Text(
                'Deletes parsed SMS rows and parse cache only. Accounts, '
                'transactions, and sync settings are left untouched.',
              ),
              onTap: () => _clearSmsState(context, ref),
            ),
          if (prefs.smsEnabled && Platform.isAndroid) ...[
            SwitchListTile(
              secondary: const Icon(Icons.bolt_outlined),
              title: const Text('Auto-confirm high-confidence SMS'),
              subtitle: Text(
                prefs.smsAutoConfirm
                    ? 'Skip the Inbox when a parser is at least '
                          '${(prefs.smsAutoConfirmThreshold * 100).round()}% '
                          'confident and no matching transaction exists yet.'
                    : 'Off — every parsed SMS lands in the Inbox for review.',
              ),
              value: prefs.smsAutoConfirm,
              onChanged: (v) async {
                await prefs.setSmsAutoConfirm(v);
                bumpPrefs(ref);
              },
            ),
            if (prefs.smsAutoConfirm)
              ListTile(
                leading: const Icon(Icons.tune),
                title: const Text('Auto-confirm threshold'),
                subtitle: Slider(
                  value: prefs.smsAutoConfirmThreshold,
                  min: 0.5,
                  max: 1.0,
                  divisions: 10,
                  label: '${(prefs.smsAutoConfirmThreshold * 100).round()}%',
                  onChanged: (v) async {
                    await prefs.setSmsAutoConfirmThreshold(v);
                    bumpPrefs(ref);
                  },
                ),
              ),
            ListTile(
              leading: const Icon(Icons.refresh),
              title: const Text('Re-scan SMS inbox'),
              subtitle: const Text(
                'Drops cached parses and re-processes the last 7 days '
                'in the background. Pending Inbox candidates survive — '
                'rows already accepted as transactions are unaffected.',
              ),
              onTap: () => _rescanSms(context, ref),
            ),
            ListTile(
              leading: const Icon(Icons.auto_fix_high_outlined),
              title: const Text('Re-enrich past SMS'),
              subtitle: const Text(
                'Uploads the bodies of already-confirmed SMS to the sync '
                'server and re-runs the parser to clean up payee/category '
                'metadata. Fixes old transactions with garbled merchant '
                'names. Needs the sync server configured.',
              ),
              onTap: () => _reenrichSms(context, ref),
            ),
          ],
          const _SectionHeader('Sync'),
          ListTile(
            leading: const Icon(Icons.cloud_outlined),
            title: const Text('Sync server'),
            subtitle: FutureBuilder<String?>(
              future: ref.read(secureStoreProvider).readSyncBaseUrl(),
              builder: (_, s) =>
                  Text(s.data ?? 'Not configured — runs fully on-device'),
            ),
            onTap: () => _editSync(context, ref),
          ),
          ListTile(
            leading: const Icon(Icons.sync),
            title: const Text('Sync now'),
            subtitle: Text(
              prefs.syncLastAt == null
                  ? 'Never synced'
                  : 'Last: ${_formatTime(prefs.syncLastAt!)}',
            ),
            onTap: () => _syncNow(context, ref),
          ),
          const _SectionHeader('Location'),
          SwitchListTile(
            secondary: const Icon(Icons.my_location_outlined),
            title: const Text('Attach location to new entries'),
            subtitle: const Text(
              'When enabled, manual and AI saves ask for location permission and store coordinates on the transaction.',
            ),
            value: prefs.locationCaptureEnabled,
            onChanged: (v) async {
              await prefs.setLocationCaptureEnabled(v);
              bumpPrefs(ref);
            },
          ),
          const _SectionHeader('Appearance'),
          ListTile(
            leading: const Icon(Icons.brightness_6_outlined),
            title: const Text('Theme'),
            subtitle: Text(prefs.themeMode),
            onTap: () => _editTheme(context, ref),
          ),
          const _SectionHeader('Library'),
          ListTile(
            leading: const Icon(Icons.label_outline),
            title: const Text('Categories'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/categories'),
          ),
          ListTile(
            leading: const Icon(Icons.sell_outlined),
            title: const Text('Tags'),
            subtitle: prefs.activeTagId == null
                ? null
                : const Text('Active tag is applied to new expenses.'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/tags'),
          ),
          ListTile(
            leading: const Icon(Icons.rule_outlined),
            title: const Text('Rules'),
            subtitle: const Text('Synced matching rules for SMS and entries.'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/rules'),
          ),
          ListTile(
            leading: const Icon(Icons.event_repeat_outlined),
            title: const Text('Recurring transactions'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/recurrences'),
          ),
          const _SectionHeader('Data'),
          FutureBuilder<int?>(
            future: ref.read(backupServiceProvider).lastExportAt(),
            builder: (context, snapshot) => ListTile(
              leading: const Icon(Icons.verified_user_outlined),
              title: const Text('Data status'),
              subtitle: Text(
                [
                  snapshot.data == null
                      ? 'No local backup exported yet'
                      : 'Last backup ${_formatTime(snapshot.data!)}',
                  prefs.syncLastAt == null
                      ? 'sync not run yet'
                      : 'last sync ${_formatTime(prefs.syncLastAt!)}',
                ].join(' · '),
              ),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.upload_file_outlined),
            title: const Text('Export backup'),
            subtitle: const Text(
              'JSON dump of every account, category, and transaction.',
            ),
            onTap: () => _exportBackup(context, ref),
          ),
          ListTile(
            leading: const Icon(Icons.table_view_outlined),
            title: const Text('Export CSV'),
            subtitle: const Text('Spreadsheet-friendly transaction export.'),
            onTap: () => _exportCsv(context, ref),
          ),
          ListTile(
            leading: const Icon(Icons.download_outlined),
            title: const Text('Import backup'),
            subtitle: const Text(
              'Wipes existing data and restores from a JSON file.',
            ),
            onTap: () => _importBackup(context, ref),
          ),
          const _SectionHeader('About'),
          const ListTile(
            leading: Icon(Icons.info_outline),
            title: Text('Build'),
            subtitle: Text(
              buildSha == 'dev'
                  ? 'dev build · v$buildVersion'
                  : 'v$buildVersion · $buildSha · $buildTimestamp',
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _clearSmsState(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text('Clear SMS Inbox state?'),
        content: const Text(
          'This deletes all SMS parse rows, including pending Inbox cards, '
          'dismissed rows, error rows, and the parse cache. Existing '
          'transactions are not deleted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.of(dialogCtx).pop(true),
            child: const Text('Clear'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final pipeline = ref.read(smsPipelineProvider);
    final prefs = ref.read(prefsProvider);

    await pipeline.clearStoredState();
    if (prefs.smsEnabled) {
      pipeline.startListening(drainQueued: false);
    }

    if (!context.mounted) return;
    showTimedSnackBar(
      ScaffoldMessenger.of(context),
      const SnackBar(content: Text('SMS Inbox state cleared.')),
      duration: const Duration(seconds: 2),
    );
  }

  /// Wipes everything except already-accepted transactions and the
  /// rows the user is still reviewing in the Inbox, then kicks off a
  /// fresh backfill. Targets two recurring symptoms: stale cache rows
  /// from a previous parser version silently suppressing today's SMS,
  /// and per-message dedupe locking past parser failures into
  /// permanent `status='error'` rows.
  void _rescanSms(BuildContext context, WidgetRef ref) {
    final messenger = ScaffoldMessenger.of(context);
    unawaited(() async {
      // Keep the Inbox ('inbox') and accepted history ('accepted'); drop
      // retryable rows across the historical window so dedupe doesn't lock
      // past parser failures into permanent `error`/`none` rows.
      final added = await ref
          .read(smsPipelineProvider)
          .retryFailedBackfill(window: const Duration(days: 7));
      if (!context.mounted) return;
      showTimedSnackBar(
        messenger,
        SnackBar(content: Text('SMS re-scan complete — $added new.')),
      );
    }());
    showTimedSnackBar(
      messenger,
      const SnackBar(
        content: Text('Re-scanning — Inbox updates as messages parse.'),
      ),
    );
  }

  void _reenrichSms(BuildContext context, WidgetRef ref) {
    final messenger = ScaffoldMessenger.of(context);
    unawaited(() async {
      try {
        final uploaded = await ref
            .read(smsRepositoryProvider)
            .backfillSmsBodies();
        if (!context.mounted) return;
        final msg = uploaded == 0
            ? 'No confirmed SMS to re-enrich (or sync server not set).'
            : 'Uploaded $uploaded SMS — server is re-enriching; '
                  'cleaned rows sync back shortly.';
        showTimedSnackBar(messenger, SnackBar(content: Text(msg)));
      } catch (e) {
        if (!context.mounted) return;
        showTimedSnackBar(
          messenger,
          SnackBar(content: Text('Re-enrich failed: $e')),
        );
      }
    }());
    showTimedSnackBar(
      messenger,
      const SnackBar(content: Text('Re-enriching past SMS…')),
    );
  }

  Future<void> _toggleSms(BuildContext context, WidgetRef ref, bool v) async {
    final prefs = ref.read(prefsProvider);
    if (v) {
      final reader = ref.read(smsReaderProvider);
      final granted = await reader.ensurePermission();
      if (!granted) {
        if (!context.mounted) return;
        showTimedSnackBar(
          ScaffoldMessenger.of(context),
          const SnackBar(content: Text('SMS permission denied.')),
        );
        return;
      }
      await prefs.setSmsEnabled(true);
      bumpPrefs(ref);
      await ref.read(notificationServiceProvider).requestPermission();
      final pipeline = ref.read(smsPipelineProvider);
      pipeline.startListening();
      // Fire-and-forget: backfill walks the recent inbox through
      // the LLM serially, which can take minutes. Awaiting it here
      // freezes the toggle and makes the Inbox look broken. The
      // pipeline writes rows incrementally and the Inbox StreamProvider
      // picks them up as they land. The trailing .then() tees up a
      // snackbar with the final count once it finishes.
      unawaited(
        pipeline.catchUpRecent(showProgress: true).then((added) {
          if (!context.mounted) return;
          showTimedSnackBar(
            ScaffoldMessenger.of(context),
            SnackBar(content: Text('SMS scan complete — $added new.')),
          );
        }),
      );
      if (!context.mounted) return;
      showTimedSnackBar(
        ScaffoldMessenger.of(context),
        const SnackBar(
          content: Text(
            'Scanning inbox — items will appear as they\'re parsed.',
          ),
        ),
      );
    } else {
      await prefs.setSmsEnabled(false);
      bumpPrefs(ref);
      await ref.read(smsPipelineProvider).stop();
    }
  }

  Future<void> _editSymbol(BuildContext context, WidgetRef ref) async {
    final prefs = ref.read(prefsProvider);
    final ctrl = TextEditingController(text: prefs.currencySymbol);
    try {
      final v = await showDialog<String>(
        context: context,
        builder: (dialogCtx) => AlertDialog(
          title: const Text('Currency symbol'),
          content: TextField(controller: ctrl),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogCtx).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogCtx).pop(ctrl.text),
              child: const Text('Save'),
            ),
          ],
        ),
      );
      if (v != null && v.isNotEmpty) {
        await prefs.setCurrencySymbol(v);
        bumpPrefs(ref);
      }
    } finally {
      ctrl.dispose();
    }
  }

  Future<void> _editMinorDigits(BuildContext context, WidgetRef ref) async {
    final prefs = ref.read(prefsProvider);
    final v = await showDialog<int>(
      context: context,
      builder: (dialogCtx) => SimpleDialog(
        title: const Text('Minor digits'),
        children: [
          for (final n in [0, 2, 3, 4])
            SimpleDialogOption(
              onPressed: () => Navigator.of(dialogCtx).pop(n),
              child: Text('$n'),
            ),
        ],
      ),
    );
    if (v != null) {
      await prefs.setCurrencyMinorDigits(v);
      bumpPrefs(ref);
    }
  }

  Future<void> _editTheme(BuildContext context, WidgetRef ref) async {
    final prefs = ref.read(prefsProvider);
    final current = prefs.themeMode;
    final v = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetCtx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Theme', style: Theme.of(sheetCtx).textTheme.titleLarge),
              const SizedBox(height: 12),
              for (final option in const [
                _ThemeOption(
                  id: 'system',
                  label: 'System',
                  description: 'Follow this phone.',
                  icon: Icons.brightness_auto_outlined,
                ),
                _ThemeOption(
                  id: 'light',
                  label: 'Light',
                  description: 'Always use light mode.',
                  icon: Icons.light_mode_outlined,
                ),
                _ThemeOption(
                  id: 'dark',
                  label: 'Dark',
                  description: 'Always use dark mode.',
                  icon: Icons.dark_mode_outlined,
                ),
              ])
                ListTile(
                  leading: Icon(option.icon),
                  title: Text(option.label),
                  subtitle: Text(option.description),
                  trailing: current == option.id
                      ? const Icon(Icons.check_circle)
                      : null,
                  onTap: () => Navigator.of(sheetCtx).pop(option.id),
                ),
            ],
          ),
        ),
      ),
    );
    if (v != null) {
      await prefs.setThemeMode(v);
      bumpPrefs(ref);
      ref.invalidate(themeModeProvider);
    }
  }

  Future<void> _exportBackup(BuildContext context, WidgetRef ref) async {
    try {
      final file = await ref.read(backupServiceProvider).exportToFile();
      if (!context.mounted) return;
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/json')],
        subject: 'Gullak backup',
        text:
            'Gullak backup ${DateTime.now().toIso8601String().split('T').first}',
      );
    } catch (e) {
      if (!context.mounted) return;
      showTimedSnackBar(
        ScaffoldMessenger.of(context),
        SnackBar(content: Text('Export failed: $e')),
      );
    }
  }

  Future<void> _exportCsv(BuildContext context, WidgetRef ref) async {
    try {
      final file = await ref
          .read(backupServiceProvider)
          .exportTransactionsCsv();
      if (!context.mounted) return;
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'text/csv')],
        subject: 'Gullak transactions CSV',
        text: 'Gullak transactions export',
      );
    } catch (e) {
      if (!context.mounted) return;
      showTimedSnackBar(
        ScaffoldMessenger.of(context),
        SnackBar(content: Text('CSV export failed: $e')),
      );
    }
  }

  Future<void> _importBackup(BuildContext context, WidgetRef ref) async {
    final picker = await _pickJsonFile();
    if (picker == null || !context.mounted) return;
    BackupPreview preview;
    try {
      preview = ref.read(backupServiceProvider).previewJson(picker);
    } catch (e) {
      showTimedSnackBar(
        ScaffoldMessenger.of(context),
        SnackBar(content: Text('Import preview failed: $e')),
      );
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text('Replace all data?'),
        content: Text(
          'Backup ${preview.exportedAt ?? ''}\n\n'
          '${preview.accounts} accounts\n'
          '${preview.transactions} transactions\n'
          '${preview.categories} categories\n'
          '${preview.tags} tags\n'
          '${preview.rules} rules\n'
          '${preview.budgets} budgets\n\n'
          'Importing will replace the current local dataset.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogCtx).pop(true),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    try {
      final imported = await ref
          .read(backupServiceProvider)
          .importFromJson(picker);
      if (!context.mounted) return;
      showTimedSnackBar(
        ScaffoldMessenger.of(context),
        SnackBar(content: Text('Restored $imported rows.')),
      );
    } catch (e) {
      if (!context.mounted) return;
      showTimedSnackBar(
        ScaffoldMessenger.of(context),
        SnackBar(content: Text('Import failed: $e')),
      );
    }
  }

  Future<String?> _pickJsonFile() => jsonPicker.pickJson();

  static String _formatTime(int epochMs) {
    final t = DateTime.fromMillisecondsSinceEpoch(epochMs);
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${t.day}/${t.month}/${t.year % 100}';
  }

  Future<void> _editSync(BuildContext context, WidgetRef ref) async {
    final s = ref.read(secureStoreProvider);
    final base = TextEditingController(text: await s.readSyncBaseUrl() ?? '');
    final key = TextEditingController(text: await s.readSyncApiKey() ?? '');
    if (!context.mounted) return;
    try {
      final ok = await showDialog<bool>(
        context: context,
        builder: (dialogCtx) {
          final width = MediaQuery.of(dialogCtx).size.width - 48;
          return AlertDialog(
            title: const Text('Sync server'),
            contentPadding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            content: SizedBox(
              width: width,
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Optional. Point at a self-hosted Gullak server to '
                      'merge data across devices. The phone keeps working '
                      'offline either way.',
                      style: Theme.of(dialogCtx).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(dialogCtx).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: base,
                      decoration: const InputDecoration(
                        labelText: 'Base URL',
                        hintText: 'https://gullak.mrkaran.dev',
                      ),
                      autocorrect: false,
                      enableSuggestions: false,
                      keyboardType: TextInputType.url,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: key,
                      decoration: const InputDecoration(
                        labelText: 'API key',
                        hintText: 'optional',
                      ),
                      obscureText: true,
                      autocorrect: false,
                      enableSuggestions: false,
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => _testSync(
                  context,
                  ref,
                  baseUrl: base.text,
                  apiKey: key.text,
                ),
                child: const Text('Test'),
              ),
              TextButton(
                onPressed: () => Navigator.of(dialogCtx).pop(false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(dialogCtx).pop(true),
                child: const Text('Save'),
              ),
            ],
          );
        },
      );
      if (ok == true) {
        await s.writeSync(
          baseUrl: base.text.trim().isEmpty ? null : base.text.trim(),
          apiKey: key.text.trim().isEmpty ? null : key.text.trim(),
        );
        ref.invalidate(piAiClientProvider);
        ref.invalidate(llmSmsParserProvider);
      }
    } finally {
      base.dispose();
      key.dispose();
    }
  }

  Future<void> _testSync(
    BuildContext context,
    WidgetRef ref, {
    required String baseUrl,
    required String apiKey,
  }) async {
    final messenger = ScaffoldMessenger.of(context);
    final url = baseUrl.trim();
    if (url.isEmpty) {
      showTimedSnackBar(
        messenger,
        const SnackBar(content: Text('Enter a Base URL first.')),
      );
      return;
    }
    final result = await ref
        .read(syncServiceProvider)
        .testConnection(
          baseUrl: url,
          apiKey: apiKey.trim().isEmpty ? null : apiKey.trim(),
        );
    if (!context.mounted) return;
    final syncStatus = ref.read(syncStatusProvider.notifier);
    if (result.ok) {
      syncStatus.online();
    } else {
      syncStatus.offline(result.message);
    }
    showTimedSnackBar(
      messenger,
      result.ok
          ? SnackBar(content: Text('Reachable: ${result.message}'))
          : errorSnackBar(context, 'Failed: ${result.message}'),
    );
  }

  Future<void> _syncNow(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final result = await ref.read(syncServiceProvider).syncOnce();
    if (!context.mounted) return;
    bumpPrefs(ref);
    final syncStatus = ref.read(syncStatusProvider.notifier);
    if (result.error == null) {
      syncStatus.online();
    } else {
      syncStatus.offline(result.error!);
    }
    final msg = result.error != null
        ? 'Sync failed: ${result.error}'
        : 'Pushed ${result.pushed}, pulled ${result.pulled}';
    showTimedSnackBar(
      messenger,
      result.error == null
          ? SnackBar(content: Text(msg))
          : errorSnackBar(context, msg),
    );
  }
}

class _ThemeOption {
  const _ThemeOption({
    required this.id,
    required this.label,
    required this.description,
    required this.icon,
  });

  final String id;
  final String label;
  final String description;
  final IconData icon;
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
      child: Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: cs.onSurfaceVariant,
          letterSpacing: 1.2,
        ),
      ),
    );
  }
}
