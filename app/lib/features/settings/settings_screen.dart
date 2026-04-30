import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../data/sms/sms_pipeline.dart';
import '../../data/sms/sms_reader.dart';
import '../../state/providers.dart';
import '../backup/backup_service.dart';
import '../backup/file_pick.dart';
import '../inbox/data/sms_repository.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(prefsProvider);
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
              ref.invalidate(prefsProvider);
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
            subtitle: Text(Platform.isAndroid
                ? 'Reads only bank/transactional SMS. Everything else is ignored.'
                : 'Available on Android only.'),
            value: prefs.smsEnabled && Platform.isAndroid,
            onChanged: !Platform.isAndroid
                ? null
                : (v) => _toggleSms(context, ref, v),
          ),
          if (prefs.smsEnabled && Platform.isAndroid)
            ListTile(
              leading: const Icon(Icons.refresh),
              title: const Text('Re-scan SMS inbox'),
              subtitle: const Text('Re-process the last 90 days.'),
              onTap: () async {
                final added = await ref.read(smsPipelineProvider).backfill();
                ref.invalidate(inboxItemsProvider);
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Re-ingested $added.')),
                );
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
          const _SectionHeader('Data'),
          ListTile(
            leading: const Icon(Icons.upload_file_outlined),
            title: const Text('Export backup'),
            subtitle: const Text('JSON dump of every account, category, and transaction.'),
            onTap: () => _exportBackup(context, ref),
          ),
          ListTile(
            leading: const Icon(Icons.download_outlined),
            title: const Text('Import backup'),
            subtitle: const Text('Wipes existing data and restores from a JSON file.'),
            onTap: () => _importBackup(context, ref),
          ),
        ],
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('SMS permission denied.')),
        );
        return;
      }
      await prefs.setSmsEnabled(true);
      ref.invalidate(prefsProvider);
      final pipeline = ref.read(smsPipelineProvider);
      pipeline.startListening();
      final added = await pipeline.backfill();
      ref.invalidate(inboxItemsProvider);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Backfilled $added candidate(s).')),
      );
    } else {
      await prefs.setSmsEnabled(false);
      ref.invalidate(prefsProvider);
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
        ref.invalidate(prefsProvider);
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
      ref.invalidate(prefsProvider);
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
      ref.invalidate(prefsProvider);
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
        text: 'Gullak backup ${DateTime.now().toIso8601String().split('T').first}',
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Export failed: $e')),
      );
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
      final imported = await ref.read(backupServiceProvider).importFromJson(picker);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Restored $imported rows.')),
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Import failed: $e')),
      );
    }
  }

  Future<String?> _pickJsonFile() => jsonPicker.pickJson();

  Future<void> _editLlm(BuildContext context, WidgetRef ref) async {
    final s = ref.read(secureStoreProvider);
    final base = TextEditingController(text: await s.readLlmBaseUrl() ?? '');
    final key = TextEditingController(text: await s.readLlmApiKey() ?? '');
    final model = TextEditingController(text: await s.readLlmModel() ?? '');
    if (!context.mounted) return;
    try {
      final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('AI endpoint'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: base, decoration: const InputDecoration(labelText: 'Base URL')),
              const SizedBox(height: 8),
              TextField(
                controller: key,
                decoration: const InputDecoration(labelText: 'API key'),
                obscureText: true,
              ),
              const SizedBox(height: 8),
              TextField(controller: model, decoration: const InputDecoration(labelText: 'Model')),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Save'),
            ),
          ],
        ),
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
