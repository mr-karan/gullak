import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/error_state.dart';
import '../transactions/data/transaction_repository.dart';
import '../transactions/scoped_transactions_view.dart';
import 'data/category_repository.dart';

/// Tap a category → its full transaction history plus "total spent" for
/// Today / This Week / This Month / This Year / All Time. Mirrors the payee
/// detail screen; rows lead with the payee since the category is fixed.
class CategoryDetailScreen extends ConsumerWidget {
  const CategoryDetailScreen({required this.id, super.key});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categoryAsync = ref.watch(categoryByIdProvider(id));
    return categoryAsync.when(
      loading: () => _scaffold('Category', const _Loading()),
      error: (e, _) => _scaffold(
        'Category',
        ErrorState(
          message: e.toString(),
          onRetry: () => ref.invalidate(categoryByIdProvider(id)),
        ),
      ),
      data: (category) {
        if (category == null) {
          return _scaffold(
            'Category',
            const EmptyState(
              icon: Icons.category_outlined,
              title: 'Category not found',
              body: 'It may have been deleted.',
            ),
          );
        }
        final txAsync = ref.watch(
          transactionsListProvider(TransactionListQuery(categoryId: id)),
        );
        return _scaffold(
          category.name,
          ScopedTransactionsView(
            txAsync: txAsync,
            scope: TxnScope.category,
            emptyBody: 'Spends in this category will show here.',
          ),
        );
      },
    );
  }

  Widget _scaffold(String title, Widget body) => Scaffold(
    appBar: AppBar(title: Text(title)),
    body: body,
  );
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}
