import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/ai_defaults.dart';
import '../../core/build_info.dart';
import '../../core/money.dart';
import '../../core/notification_service.dart';
import '../../data/ai/llm_client.dart';
import '../../data/sms/sms_pipeline.dart';
import '../../data/sms/sms_reader.dart';
import '../../state/providers.dart';
import '../../sync/sync_service.dart';
import '../backup/backup_service.dart';
import '../backup/file_pick.dart';
import '../accounts/data/account_repository.dart';
import '../categories/data/category_repository.dart';
import '../entry/ai_extractor.dart';
import '../payees/data/payee_repository.dart';

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
          const _SectionHeader('AI assist'),
          SwitchListTile(
            secondary: const Icon(Icons.auto_awesome_outlined),
            title: const Text('Enable AI parsing'),
            value: prefs.aiEnabled,
            onChanged: (v) async {
              await prefs.setAiEnabled(v);
              bumpPrefs(ref);
            },
          ),
          ListTile(
            leading: const Icon(Icons.link),
            title: const Text('AI endpoint'),
            subtitle: FutureBuilder<String?>(
              future: ref.read(secureStoreProvider).readLlmBaseUrl(),
              builder: (_, s) => Text(s.data ?? 'Not configured'),
            ),
            onTap: () => _editLlm(context, ref),
          ),
          const _SectionHeader('SMS'),
          SwitchListTile(
            secondary: const Icon(Icons.sms_outlined),
            title: const Text('Read transactional SMS'),
            subtitle: Text(
              Platform.isAndroid
                  ? 'Reads only bank/transactional SMS. Everything else is ignored.'
                  : 'Available on Android only.',
            ),
            value: prefs.smsEnabled && Platform.isAndroid,
            onChanged: !Platform.isAndroid
                ? null
                : (v) => _toggleSms(context, ref, v),
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
                'Drops cached parses and re-processes the last 90 days '
                'in the background. Pending Inbox candidates survive — '
                'rows already accepted as transactions are unaffected.',
              ),
              onTap: () => _rescanSms(context, ref),
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
            leading: const Icon(Icons.event_repeat_outlined),
            title: const Text('Recurring transactions'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/recurrences'),
          ),
          const _SectionHeader('Data'),
          ListTile(
            leading: const Icon(Icons.upload_file_outlined),
            title: const Text('Export backup'),
            subtitle: const Text(
              'JSON dump of every account, category, and transaction.',
            ),
            onTap: () => _exportBackup(context, ref),
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

  /// Wipes everything except already-accepted transactions and the
  /// rows the user is still reviewing in the Inbox, then kicks off a
  /// fresh backfill. Targets two recurring symptoms: stale cache rows
  /// from a previous parser version silently suppressing today's SMS,
  /// and per-message dedupe locking past parser failures into
  /// permanent `status='error'` rows.
  void _rescanSms(BuildContext context, WidgetRef ref) {
    final db = ref.read(dbProvider);
    final messenger = ScaffoldMessenger.of(context);
    unawaited(() async {
      // The cache is dead code as of the registry cleanup but old
      // installs still have rows; clear it so anyone who upgrades in
      // place sees the same behaviour as a fresh install.
      await db.customStatement('DELETE FROM sms_parse_cache');
      // Keep the Inbox ('inbox') and accepted history ('accepted'); drop
      // anything else so dedupe doesn't lock past parser failures into
      // permanent `error`/`none` rows.
      await db.customStatement(
        // ignore: prefer_single_quotes
        "DELETE FROM sms_messages WHERE candidate_status IN "
        "('error', 'none', 'duplicate', 'dismissed')",
      );
      await ref.read(smsPipelineProvider).backfill();
    }());
    messenger.showSnackBar(
      const SnackBar(
        content: Text('Re-scanning — Inbox updates as messages parse.'),
      ),
    );
  }

  Future<void> _toggleSms(BuildContext context, WidgetRef ref, bool v) async {
    final prefs = ref.read(prefsProvider);
    if (v) {
      final reader = ref.read(smsReaderProvider);
      final granted = await reader.ensurePermission();
      if (!granted) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('SMS permission denied.')));
        return;
      }
      await prefs.setSmsEnabled(true);
      bumpPrefs(ref);
      await ref.read(notificationServiceProvider).requestPermission();
      final pipeline = ref.read(smsPipelineProvider);
      pipeline.startListening();
      // Fire-and-forget: backfill walks the whole 90-day inbox through
      // the LLM serially, which can take minutes. Awaiting it here
      // freezes the toggle and makes the Inbox look broken. The
      // pipeline writes rows incrementally and the Inbox StreamProvider
      // picks them up as they land.
      unawaited(pipeline.backfill());
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Scanning inbox — items will appear as they\'re parsed.'),
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
        builder: (_) => AlertDialog(
          title: const Text('Currency symbol'),
          content: TextField(controller: ctrl),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(ctrl.text),
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
      builder: (_) => SimpleDialog(
        title: const Text('Minor digits'),
        children: [
          for (final n in [0, 2, 3, 4])
            SimpleDialogOption(
              onPressed: () => Navigator.of(context).pop(n),
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
    final v = await showDialog<String>(
      context: context,
      builder: (_) => SimpleDialog(
        title: const Text('Theme'),
        children: [
          for (final mode in ['system', 'light', 'dark'])
            SimpleDialogOption(
              onPressed: () => Navigator.of(context).pop(mode),
              child: Text(mode),
            ),
        ],
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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Export failed: $e')));
    }
  }

  Future<void> _importBackup(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Replace all data?'),
        content: const Text(
          'Importing will delete every account, category, and transaction '
          'currently in the app and restore from the file you pick.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    // ignore: avoid_dynamic_calls
    final picker = await _pickJsonFile();
    if (picker == null || !context.mounted) return;
    try {
      final imported = await ref
          .read(backupServiceProvider)
          .importFromJson(picker);
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Restored $imported rows.')));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Import failed: $e')));
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
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
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
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            result.ok
                ? 'Reachable: ${result.message}'
                : 'Failed: ${result.message}',
          ),
        ),
      );
  }

  Future<void> _syncNow(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final result = await ref.read(syncServiceProvider).syncOnce();
    if (!context.mounted) return;
    bumpPrefs(ref);
    final msg = result.error != null
        ? 'Sync failed: ${result.error}'
        : 'Pushed ${result.pushed}, pulled ${result.pulled}';
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _editLlm(BuildContext context, WidgetRef ref) async {
    final s = ref.read(secureStoreProvider);
    final base = TextEditingController(text: await s.readLlmBaseUrl() ?? '');
    final key = TextEditingController(text: await s.readLlmApiKey() ?? '');
    final model = TextEditingController(text: await s.readLlmModel() ?? '');
    if (!context.mounted) return;
    try {
      final ok = await showDialog<bool>(
        context: context,
        builder: (dialogCtx) {
          final width =
              MediaQuery.of(dialogCtx).size.width -
              48; // wider than the AlertDialog default
          return AlertDialog(
            title: const Text('AI endpoint'),
            contentPadding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            content: SizedBox(
              width: width,
              child: StatefulBuilder(
                builder: (ctx, setLocal) => SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'PRESETS',
                        style: Theme.of(ctx).textTheme.labelSmall?.copyWith(
                          color: Theme.of(ctx).colorScheme.onSurfaceVariant,
                          letterSpacing: 1.2,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ActionChip(
                            avatar: const Icon(Icons.auto_awesome, size: 16),
                            label: const Text('OpenRouter • Gemini 3 Flash'),
                            onPressed: () => setLocal(() {
                              base.text = kDefaultAiBaseUrl;
                              model.text = kDefaultAiModel;
                            }),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: base,
                        decoration: const InputDecoration(
                          labelText: 'Base URL',
                          hintText: 'https://openrouter.ai/api/v1',
                        ),
                        autocorrect: false,
                        enableSuggestions: false,
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: model,
                        decoration: const InputDecoration(
                          labelText: 'Model',
                          hintText: 'google/gemini-3-flash-preview',
                        ),
                        autocorrect: false,
                        enableSuggestions: false,
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: key,
                        decoration: const InputDecoration(
                          labelText: 'API key',
                          hintText: 'sk-or-v1-…',
                        ),
                        obscureText: true,
                        autocorrect: false,
                        enableSuggestions: false,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => _testLlm(
                  context,
                  ref,
                  baseUrl: base.text,
                  apiKey: key.text,
                  model: model.text,
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
        await s.writeLlm(
          baseUrl: base.text.trim().isEmpty ? null : base.text.trim(),
          apiKey: key.text.trim().isEmpty ? null : key.text.trim(),
          model: model.text.trim().isEmpty ? null : model.text.trim(),
        );
        ref.invalidate(llmClientProvider);
      }
    } finally {
      base.dispose();
      key.dispose();
      model.dispose();
    }
  }

  Future<void> _testLlm(
    BuildContext context,
    WidgetRef ref, {
    required String baseUrl,
    required String apiKey,
    required String model,
  }) async {
    final messenger = ScaffoldMessenger.of(context);
    final trimmedBaseUrl = baseUrl.trim();
    final trimmedModel = model.trim();
    if (trimmedBaseUrl.isEmpty || trimmedModel.isEmpty) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('Enter endpoint and model first.')),
        );
      return;
    }
    try {
      final extractor = AiExtractor(
        llm: LlmClient(
          baseUrl: trimmedBaseUrl,
          model: trimmedModel,
          apiKey: apiKey.trim().isEmpty ? null : apiKey.trim(),
        ),
        accountRepo: ref.read(accountRepoProvider),
        categoryRepo: ref.read(categoryRepoProvider),
        payeeRepo: ref.read(payeeRepoProvider),
        minorDigits: ref.read(prefsProvider).currencyMinorDigits,
      );
      final parsed = await extractor.parse('blinkit 450 hdfc groceries');
      if (!context.mounted) return;
      final prefs = ref.read(prefsProvider);
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              'Parsed ${Money.format(parsed.amountCents, symbol: prefs.currencySymbol, minorDigits: prefs.currencyMinorDigits)}'
              '${parsed.payeeName == null ? '' : ' at ${parsed.payeeName}'}',
            ),
          ),
        );
    } catch (e) {
      if (!context.mounted) return;
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text('AI test failed: $e')));
    }
  }
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
