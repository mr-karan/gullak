import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/snackbars.dart';
import '../../state/providers.dart';
import '../../ui/widgets/empty_state.dart';
import 'category_visuals.dart';
import 'data/category_repository.dart';

class CategoriesScreen extends ConsumerWidget {
  const CategoriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final groupsAsync = ref.watch(categoryGroupsListProvider);
    final catsAsync = ref.watch(categoriesListProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Categories'),
        actions: [
          IconButton(
            icon: const Icon(Icons.create_new_folder_outlined),
            tooltip: 'New group',
            onPressed: () => _newGroup(context, ref),
          ),
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'New category',
            onPressed: () => _newCategory(context, ref),
          ),
        ],
      ),
      body: groupsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (groups) {
          final cats = catsAsync.value ?? const <CategoryRow>[];
          if (groups.isEmpty && cats.isEmpty) {
            return EmptyState(
              icon: Icons.label_outline,
              title: 'No categories yet',
              body: 'Add a group, then categories inside it.',
              action: FilledButton.icon(
                onPressed: () => _newGroup(context, ref),
                icon: const Icon(Icons.add),
                label: const Text('New group'),
              ),
            );
          }
          final byGroup = <String, List<CategoryRow>>{};
          for (final c in cats) {
            byGroup.putIfAbsent(c.groupId, () => []).add(c);
          }
          return ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              for (final g in groups) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 24, 8, 10),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          g.name.toUpperCase(),
                          style: Theme.of(context).textTheme.labelSmall
                              ?.copyWith(
                                color: cs.onSurfaceVariant,
                                letterSpacing: 1.2,
                              ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.edit_outlined, size: 18),
                        tooltip: 'Rename group',
                        onPressed: () => _renameGroup(context, ref, g),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline, size: 18),
                        tooltip: 'Delete group',
                        onPressed: () => _deleteGroup(context, ref, g),
                      ),
                    ],
                  ),
                ),
                for (final c in byGroup[g.id] ?? const <CategoryRow>[])
                  Card(
                    margin: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    child: ListTile(
                      leading: _EmojiBadge(categoryEmoji(c.icon, c.name)),
                      title: Text(c.name),
                      subtitle: Text(g.name),
                      onTap: () => _editCategory(context, ref, c),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => _deleteCategory(context, ref, c),
                      ),
                    ),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }

  Future<void> _newGroup(BuildContext context, WidgetRef ref) async {
    final ctrl = TextEditingController();
    bool isIncome = false;
    try {
      final ok = await showDialog<bool>(
        context: context,
        builder: (_) => StatefulBuilder(
          builder: (ctx, setSt) => AlertDialog(
            title: const Text('New group'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: ctrl,
                  autofocus: true,
                  decoration: const InputDecoration(labelText: 'Name'),
                ),
                CheckboxListTile(
                  value: isIncome,
                  title: const Text('Income group'),
                  onChanged: (v) => setSt(() => isIncome = v ?? false),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('Add'),
              ),
            ],
          ),
        ),
      );
      if (ok == true && ctrl.text.trim().isNotEmpty) {
        await ref
            .read(categoryRepoProvider)
            .createGroup(name: ctrl.text.trim(), isIncome: isIncome);
      }
    } finally {
      ctrl.dispose();
    }
  }

  Future<void> _renameGroup(
    BuildContext context,
    WidgetRef ref,
    CategoryGroupRow g,
  ) async {
    // Drift doesn't expose direct group rename in the repo; keep simple.
    final ctrl = TextEditingController(text: g.name);
    try {
      final v = await showDialog<String>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Rename group'),
          content: TextField(controller: ctrl, autofocus: true),
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
      if (v == null || v.trim().isEmpty) return;
      final db = ref.read(dbProvider);
      await db.customStatement(
        'UPDATE category_groups SET name = ? WHERE id = ?',
        [v.trim(), g.id],
      );
      ref.invalidate(categoryGroupsListProvider);
    } finally {
      ctrl.dispose();
    }
  }

  Future<void> _deleteGroup(
    BuildContext context,
    WidgetRef ref,
    CategoryGroupRow g,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Delete "${g.name}"?'),
        content: const Text('Categories in it will move to "Other".'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok == true) await ref.read(categoryRepoProvider).deleteGroup(g.id);
  }

  Future<void> _newCategory(BuildContext context, WidgetRef ref) async {
    final groups = await ref.read(categoryRepoProvider).listGroups();
    if (groups.isEmpty) {
      if (!context.mounted) return;
      showTimedSnackBar(
        ScaffoldMessenger.of(context),
        const SnackBar(content: Text('Add a group first.')),
      );
      return;
    }
    final ctrl = TextEditingController();
    final iconCtrl = TextEditingController();
    String groupId = groups.first.id;
    try {
      if (!context.mounted) return;
      final ok = await showDialog<bool>(
        context: context,
        builder: (_) => StatefulBuilder(
          builder: (ctx, setSt) => AlertDialog(
            title: const Text('New category'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: ctrl,
                  autofocus: true,
                  decoration: const InputDecoration(labelText: 'Name'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: iconCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Emoji',
                    hintText: 'Auto-picked if blank',
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: groupId,
                  decoration: const InputDecoration(labelText: 'Group'),
                  items: [
                    for (final g in groups)
                      DropdownMenuItem(value: g.id, child: Text(g.name)),
                  ],
                  onChanged: (v) => setSt(() => groupId = v ?? groupId),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('Add'),
              ),
            ],
          ),
        ),
      );
      if (ok == true && ctrl.text.trim().isNotEmpty) {
        final name = ctrl.text.trim();
        final icon = iconCtrl.text.trim().isEmpty
            ? defaultCategoryEmoji(name)
            : iconCtrl.text.trim();
        await ref
            .read(categoryRepoProvider)
            .create(name: name, groupId: groupId, icon: icon);
      }
    } finally {
      ctrl.dispose();
      iconCtrl.dispose();
    }
  }

  Future<void> _editCategory(
    BuildContext context,
    WidgetRef ref,
    CategoryRow c,
  ) async {
    final ctrl = TextEditingController(text: c.name);
    final iconCtrl = TextEditingController(text: c.icon ?? '');
    try {
      final ok = await showDialog<bool>(
        context: context,
        builder: (dialogCtx) => AlertDialog(
          title: const Text('Rename category'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: ctrl, autofocus: true),
              const SizedBox(height: 12),
              TextField(
                controller: iconCtrl,
                decoration: const InputDecoration(labelText: 'Emoji'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogCtx).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogCtx).pop(true),
              child: const Text('Save'),
            ),
          ],
        ),
      );
      if (ok == true && ctrl.text.trim().isNotEmpty) {
        await ref
            .read(categoryRepoProvider)
            .update(
              c.id,
              name: ctrl.text.trim(),
              icon: iconCtrl.text.trim().isEmpty
                  ? defaultCategoryEmoji(ctrl.text.trim())
                  : iconCtrl.text.trim(),
            );
      }
    } finally {
      ctrl.dispose();
      iconCtrl.dispose();
    }
  }

  Future<void> _deleteCategory(
    BuildContext context,
    WidgetRef ref,
    CategoryRow c,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Delete "${c.name}"?'),
        content: const Text(
          'Transactions tagged with this category will become uncategorised.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok == true) await ref.read(categoryRepoProvider).deleteCategory(c.id);
  }
}

class _EmojiBadge extends StatelessWidget {
  const _EmojiBadge(this.emoji);
  final String emoji;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return CircleAvatar(
      backgroundColor: cs.secondaryContainer,
      foregroundColor: cs.onSecondaryContainer,
      child: Text(emoji, style: const TextStyle(fontSize: 18)),
    );
  }
}
