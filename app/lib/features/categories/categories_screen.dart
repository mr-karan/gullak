import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../ui/widgets/empty_state.dart';
import 'category_form_dialog.dart';
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
          PopupMenuButton<_CategoryMenuAction>(
            onSelected: (action) {
              switch (action) {
                case _CategoryMenuAction.resetDefaults:
                  _resetDefaults(context, ref);
              }
            },
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: _CategoryMenuAction.resetDefaults,
                child: ListTile(
                  leading: Icon(Icons.refresh),
                  title: Text('Reset defaults'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
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
              body: 'Add parent categories and optional subcategories.',
              action: FilledButton.icon(
                onPressed: () => _newCategory(context, ref),
                icon: const Icon(Icons.add),
                label: const Text('New category'),
              ),
            );
          }
          final incomeGroupIds = {
            for (final g in groups)
              if (g.isIncome) g.id,
          };
          final expenseCats = cats
              .where((c) => !incomeGroupIds.contains(c.groupId))
              .toList();
          final incomeCats = cats
              .where((c) => incomeGroupIds.contains(c.groupId))
              .toList();
          return ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              _SectionTitle(label: 'Spending', color: cs.onSurfaceVariant),
              _CategoryTree(
                nodes: _layoutTree(expenseCats),
                onEdit: (c) => _editCategory(context, ref, c),
                onDelete: (c) => _deleteCategory(context, ref, c),
                onReorderParents: (ids) =>
                    ref.read(categoryRepoProvider).reorderVisible(ids),
              ),
              if (incomeCats.isNotEmpty) ...[
                _SectionTitle(label: 'Income', color: cs.onSurfaceVariant),
                _CategoryTree(
                  nodes: _layoutTree(incomeCats),
                  onEdit: (c) => _editCategory(context, ref, c),
                  onDelete: (c) => _deleteCategory(context, ref, c),
                  onReorderParents: (ids) =>
                      ref.read(categoryRepoProvider).reorderVisible(ids),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Future<void> _newCategory(BuildContext context, WidgetRef ref) async {
    final repo = ref.read(categoryRepoProvider);
    var groups = await repo.listGroups();
    if (!context.mounted) return;
    if (groups.isEmpty) {
      await repo.createGroup(name: 'Spending');
      groups = await repo.listGroups();
      if (!context.mounted || groups.isEmpty) return;
    }
    final result = await showCategoryFormDialog(
      context,
      ref,
      title: 'New category',
    );
    if (result == null) return;
    await ref
        .read(categoryRepoProvider)
        .create(
          name: result.name,
          groupId: result.groupId,
          icon: result.icon,
          parentId: result.parentId,
        );
  }

  Future<void> _editCategory(
    BuildContext context,
    WidgetRef ref,
    CategoryRow c,
  ) async {
    final result = await showCategoryFormDialog(
      context,
      ref,
      title: 'Edit category',
      initialName: c.name,
      initialIcon: c.icon,
      initialGroupId: c.groupId,
      initialParentId: c.parentId,
      selfId: c.id,
    );
    if (result == null) return;
    await ref
        .read(categoryRepoProvider)
        .update(
          c.id,
          name: result.name,
          icon: result.icon,
          groupId: result.groupId,
          parentId: result.parentId,
        );
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

  Future<void> _resetDefaults(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Reset categories?'),
        content: const Text(
          'This replaces the category tree with a fresh default set. Existing transactions stay in place but become uncategorised.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Reset'),
          ),
        ],
      ),
    );
    if (ok == true) {
      await ref.read(categoryRepoProvider).resetToDefaultTree();
    }
  }
}

enum _CategoryMenuAction { resetDefaults }

class _CategoryNode {
  const _CategoryNode(this.parent, this.children);

  final CategoryRow parent;
  final List<CategoryRow> children;
}

/// Order rows as: each parent category followed by its subcategories.
/// Subcategories whose parent isn't in the slice
/// fall to the end so they remain visible.
List<_CategoryNode> _layoutTree(List<CategoryRow> rows) {
  final byParent = <String, List<CategoryRow>>{};
  for (final r in rows) {
    if (r.parentId != null) {
      byParent.putIfAbsent(r.parentId!, () => []).add(r);
    }
  }
  final out = <_CategoryNode>[];
  for (final r in rows) {
    if (r.parentId == null) {
      out.add(_CategoryNode(r, byParent[r.id] ?? const <CategoryRow>[]));
    }
  }
  final present = {
    for (final node in out) node.parent.id,
    for (final node in out)
      for (final child in node.children) child.id,
  };
  for (final r in rows) {
    if (!present.contains(r.id)) {
      out.add(_CategoryNode(r, const []));
    }
  }
  return out;
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 10),
      child: Text(
        label.toUpperCase(),
        style: Theme.of(
          context,
        ).textTheme.labelSmall?.copyWith(color: color, letterSpacing: 1.2),
      ),
    );
  }
}

class _CategoryTree extends StatelessWidget {
  const _CategoryTree({
    required this.nodes,
    required this.onEdit,
    required this.onDelete,
    required this.onReorderParents,
  });

  final List<_CategoryNode> nodes;
  final ValueChanged<CategoryRow> onEdit;
  final ValueChanged<CategoryRow> onDelete;
  final ValueChanged<List<String>> onReorderParents;

  @override
  Widget build(BuildContext context) {
    if (nodes.isEmpty) return const SizedBox.shrink();
    return ReorderableListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      buildDefaultDragHandles: false,
      itemCount: nodes.length,
      onReorder: (oldIndex, newIndex) {
        final next = [...nodes];
        if (newIndex > oldIndex) newIndex -= 1;
        final moved = next.removeAt(oldIndex);
        next.insert(newIndex, moved);
        onReorderParents([
          for (final node in next) ...[
            node.parent.id,
            for (final child in node.children) child.id,
          ],
        ]);
      },
      itemBuilder: (context, index) {
        final node = nodes[index];
        return _CategoryParentBlock(
          key: ValueKey(node.parent.id),
          index: index,
          node: node,
          onEdit: onEdit,
          onDelete: onDelete,
        );
      },
    );
  }
}

class _CategoryParentBlock extends StatelessWidget {
  const _CategoryParentBlock({
    super.key,
    required this.index,
    required this.node,
    required this.onEdit,
    required this.onDelete,
  });

  final int index;
  final _CategoryNode node;
  final ValueChanged<CategoryRow> onEdit;
  final ValueChanged<CategoryRow> onDelete;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: cs.surfaceContainerHighest.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
          child: Column(
            children: [
              ListTile(
                contentPadding: const EdgeInsets.only(left: 4, right: 4),
                leading: _CategoryBadge(
                  iconData: categoryIconData(node.parent.name),
                  accent: categoryAccentColor(
                    node.parent.color,
                    node.parent.name,
                  ),
                ),
                title: Text(
                  node.parent.name,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                subtitle: node.children.isEmpty
                    ? const Text('No subcategories')
                    : Text('${node.children.length} subcategories'),
                onTap: () => onEdit(node.parent),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ReorderableDragStartListener(
                      index: index,
                      child: const Padding(
                        padding: EdgeInsets.all(8),
                        child: Icon(Icons.drag_handle),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Delete',
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () => onDelete(node.parent),
                    ),
                  ],
                ),
              ),
              if (node.children.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(left: 58, right: 8, bottom: 2),
                  child: Column(
                    children: [
                      for (final child in node.children)
                        _SubcategoryRow(
                          row: child,
                          onEdit: () => onEdit(child),
                          onDelete: () => onDelete(child),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SubcategoryRow extends StatelessWidget {
  const _SubcategoryRow({
    required this.row,
    required this.onEdit,
    required this.onDelete,
  });

  final CategoryRow row;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: Colors.transparent,
      child: ListTile(
        dense: true,
        contentPadding: EdgeInsets.zero,
        leading: Icon(
          categoryIconData(row.name),
          size: 20,
          color: categoryAccentColor(row.color, row.name),
        ),
        title: Text(row.name),
        onTap: onEdit,
        trailing: IconButton(
          tooltip: 'Delete',
          icon: Icon(Icons.delete_outline, color: cs.onSurfaceVariant),
          onPressed: onDelete,
        ),
      ),
    );
  }
}

class _CategoryBadge extends StatelessWidget {
  const _CategoryBadge({required this.iconData, required this.accent});
  final IconData iconData;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      backgroundColor: accent.withValues(alpha: 0.18),
      foregroundColor: accent,
      child: Icon(iconData, size: 20, color: accent),
    );
  }
}
