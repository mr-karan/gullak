import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/sms/sms_pipeline.dart';
import '../../data/sms/sms_reader.dart';
import '../../data/sync/sync_service.dart';
import '../../state/providers.dart';
import '../inbox/data/sms_repository.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(prefsProvider);
    final syncState = ref.watch(syncControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          const _SectionHeader('Connection'),
          ListTile(
            leading: const Icon(Icons.cloud_outlined),
            title: const Text('Actual server'),
            subtitle: FutureBuilder<String?>(
              future: ref.read(secureStoreProvider).readServerUrl(),
              builder: (_, s) => Text(s.data ?? 'Not configured'),
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/onboarding'),
          ),
          ListTile(
            leading: const Icon(Icons.sync),
            title: const Text('Sync now'),
            subtitle: syncState.when(
              data: (r) => Text(r == null
                  ? 'Idle'
                  : 'Pushed ${r.pushed}, pulled ${r.pulled}, errors ${r.errors.length}'),
              loading: () => const Text('Syncing…'),
              error: (e, _) => Text('Error: $e'),
            ),
            onTap: () => ref.read(syncControllerProvider.notifier).sync(),
          ),
          const _SectionHeader('Currency'),
          ListTile(
            leading: const Icon(Icons.currency_rupee),
            title: const Text('Symbol'),
            trailing: Text(prefs.currencySymbol),
            onTap: () async {
              final ctrl = TextEditingController(text: prefs.currencySymbol);
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
            },
          ),
          ListTile(
            leading: const Icon(Icons.numbers),
            title: const Text('Minor digits'),
            subtitle: Text('${prefs.currencyMinorDigits}'),
            onTap: () async {
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
            },
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
                : (v) async {
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
                  },
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
            onTap: () async {
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
            },
          ),
          const _SectionHeader('Data'),
          ListTile(
            leading: const Icon(Icons.delete_outline),
            title: const Text('Wipe local data'),
            subtitle: const Text('Drops the local cache. Actual server is untouched.'),
            onTap: () => _wipeLocal(context, ref),
          ),
        ],
      ),
    );
  }

  Future<void> _editLlm(BuildContext context, WidgetRef ref) async {
    final s = ref.read(secureStoreProvider);
    final base = TextEditingController(text: await s.readLlmBaseUrl() ?? '');
    final key = TextEditingController(text: await s.readLlmApiKey() ?? '');
    final model = TextEditingController(text: await s.readLlmModel() ?? '');
    if (!context.mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('AI endpoint'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: base, decoration: const InputDecoration(labelText: 'Base URL')),
            const SizedBox(height: 8),
            TextField(controller: key, decoration: const InputDecoration(labelText: 'API key'), obscureText: true),
            const SizedBox(height: 8),
            TextField(controller: model, decoration: const InputDecoration(labelText: 'Model')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Save')),
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
  }

  Future<void> _wipeLocal(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Wipe local data?'),
        content: const Text('This will reset the local cache. Your Actual server is not touched.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Wipe')),
        ],
      ),
    );
    if (ok == true) {
      await ref.read(secureStoreProvider).wipe();
      // Drop the database the simple way: by deleting all rows.
      // Real wipe of the file requires app restart; for v1 this is fine.
      final db = ref.read(dbProvider);
      await db.delete(db.transactions).go();
      await db.delete(db.payees).go();
      await db.delete(db.categories).go();
      await db.delete(db.categoryGroups).go();
      await db.delete(db.accounts).go();
      await db.delete(db.smsMessages).go();
      await db.delete(db.appKv).go();
      ref.invalidate(configuredProvider);
      if (!context.mounted) return;
      context.go('/onboarding');
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
