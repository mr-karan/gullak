import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../ui/widgets/empty_state.dart';
import '../../ui/widgets/error_state.dart';
import '../transactions/data/transaction_repository.dart';
import '../transactions/scoped_transactions_view.dart';
import 'data/payee_repository.dart';

/// Tap a payee → their full history plus "total spent" for Today / This Week /
/// This Month / This Year / All Time. The query matches both the payee FK and
/// the free-text name (SMS rows are name-only), so nothing is missed.
class PayeeDetailScreen extends ConsumerWidget {
  const PayeeDetailScreen({required this.id, super.key});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final payeeAsync = ref.watch(payeeByIdProvider(id));
    return payeeAsync.when(
      loading: () => _scaffold('Payee', const _Loading()),
      error: (e, _) => _scaffold(
        'Payee',
        ErrorState(
          message: e.toString(),
          onRetry: () => ref.invalidate(payeeByIdProvider(id)),
        ),
      ),
      data: (payee) {
        if (payee == null) {
          return _scaffold(
            'Payee',
            const EmptyState(
              icon: Icons.person_off_outlined,
              title: 'Payee not found',
              body: 'It may have been deleted.',
            ),
          );
        }
        final txAsync = ref.watch(
          transactionsListProvider(
            TransactionListQuery(payeeId: id, payeeName: payee.name),
          ),
        );
        return _scaffold(
          payee.name,
          ScopedTransactionsView(
            txAsync: txAsync,
            scope: TxnScope.payee,
            emptyBody: 'Spends with this payee will show here.',
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
