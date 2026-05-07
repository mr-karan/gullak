import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'category_visuals.dart';
import 'data/category_repository.dart';

class CategoryFormResult {
  const CategoryFormResult({
    required this.name,
    required this.icon,
    required this.groupId,
    required this.parentId,
  });

  final String name;
  final String icon;
  final String groupId;
  final String? parentId;
}

/// Modal form for creating or editing a one-level category tree:
/// parent category > subcategory. The Drift schema still stores a
/// group_id for compatibility with older installs and sync, but the UI
/// no longer asks users to manage groups directly.
///
/// Returns null if the user cancels.
Future<CategoryFormResult?> showCategoryFormDialog(
  BuildContext context,
  WidgetRef ref, {
  required String title,
  String initialName = '',
  String? initialIcon,
  String? initialGroupId,
  String? initialParentId,
  String? selfId,
  bool preferIncomeGroup = false,
}) async {
  final groups = await ref.read(categoryRepoProvider).listGroups();
  final cats = await ref.read(categoryRepoProvider).list(includeHidden: true);
  if (!context.mounted) return null;
  if (groups.isEmpty) return null;

  final nameCtrl = TextEditingController(text: initialName);
  final iconCtrl = TextEditingController(text: initialIcon ?? '');

  final defaultGroup = groups.firstWhere(
    (g) => g.isIncome == preferIncomeGroup,
    orElse: () => groups.first,
  );
  String groupId = initialGroupId ?? defaultGroup.id;
  String? parentId = initialParentId;
  // If this category has children, the user can't make it a sub-category.
  final hasChildren = selfId != null && cats.any((c) => c.parentId == selfId);

  try {
    return await showDialog<CategoryFormResult>(
      context: context,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (ctx, setSt) {
          final parentCandidates = cats
              .where(
                (c) => c.parentId == null && (selfId == null || c.id != selfId),
              )
              .toList();
          if (parentId != null &&
              !parentCandidates.any((c) => c.id == parentId)) {
            parentId = null;
          }
          if (parentId != null) {
            final parent = parentCandidates.firstWhere((c) => c.id == parentId);
            groupId = parent.groupId;
          }
          return AlertDialog(
            title: Text(title),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: nameCtrl,
                    autofocus: true,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(labelText: 'Name'),
                    onChanged: (_) => setSt(() {}),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: iconCtrl,
                    decoration: InputDecoration(
                      labelText: 'Emoji',
                      hintText: 'Auto-picked if blank',
                      prefixIcon: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Center(
                          widthFactor: 1,
                          child: Text(
                            iconCtrl.text.trim().isNotEmpty
                                ? iconCtrl.text.trim()
                                : defaultCategoryEmoji(nameCtrl.text.trim()),
                            style: const TextStyle(fontSize: 20),
                          ),
                        ),
                      ),
                    ),
                    onChanged: (_) => setSt(() {}),
                  ),
                  const SizedBox(height: 12),
                  if (hasChildren)
                    Padding(
                      padding: const EdgeInsets.only(top: 4, bottom: 4),
                      child: Text(
                        'Has subcategories — keep as a top-level category.',
                        style: Theme.of(ctx).textTheme.bodySmall?.copyWith(
                          color: Theme.of(ctx).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    )
                  else
                    DropdownButtonFormField<String?>(
                      initialValue: parentId,
                      decoration: const InputDecoration(
                        labelText: 'Parent category',
                      ),
                      items: [
                        const DropdownMenuItem<String?>(
                          value: null,
                          child: Text('None — make this a parent category'),
                        ),
                        for (final c in parentCandidates)
                          DropdownMenuItem<String?>(
                            value: c.id,
                            child: Text(
                              '${categoryEmoji(c.icon, c.name)}  ${c.name}',
                            ),
                          ),
                      ],
                      onChanged: parentCandidates.isEmpty
                          ? null
                          : (v) => setSt(() => parentId = v),
                    ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogCtx).pop(),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: nameCtrl.text.trim().isEmpty
                    ? null
                    : () {
                        final name = nameCtrl.text.trim();
                        final icon = iconCtrl.text.trim().isEmpty
                            ? defaultCategoryEmoji(name)
                            : iconCtrl.text.trim();
                        Navigator.of(dialogCtx).pop(
                          CategoryFormResult(
                            name: name,
                            icon: icon,
                            groupId: groupId,
                            parentId: parentId,
                          ),
                        );
                      },
                child: const Text('Save'),
              ),
            ],
          );
        },
      ),
    );
  } finally {
    nameCtrl.dispose();
    iconCtrl.dispose();
  }
}
