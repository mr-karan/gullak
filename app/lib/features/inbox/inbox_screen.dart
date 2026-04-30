import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../ui/widgets/empty_state.dart';
import 'data/sms_repository.dart';

class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncRows = ref.watch(inboxItemsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Inbox')),
      body: asyncRows.when(
        data: (rows) {
          if (rows.isEmpty) {
            return const EmptyState(
              icon: Icons.inbox_outlined,
              title: 'All caught up',
              body: 'New bank SMS that look like transactions will land here for review.',
            );
          }
          return ListView.builder(
            itemCount: rows.length,
            itemBuilder: (_, i) {
              final r = rows[i];
              return ListTile(
                title: Text(r.suggestedPayee ?? r.address),
                subtitle: Text(r.body, maxLines: 2, overflow: TextOverflow.ellipsis),
                trailing: Wrap(
                  spacing: 8,
                  children: [
                    OutlinedButton(
                      onPressed: () => ref.read(smsRepositoryProvider).dismiss(r.id),
                      child: const Text('Dismiss'),
                    ),
                    FilledButton(
                      onPressed: () => ref.read(smsRepositoryProvider).confirm(r.id),
                      child: const Text('Confirm'),
                    ),
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}
