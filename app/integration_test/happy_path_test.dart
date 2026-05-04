import 'package:flutter/material.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:gullak/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('onboard, add expense, see activity, delete and undo', (
    tester,
  ) async {
    app.main();
    await tester.pumpAndSettle(const Duration(seconds: 2));

    if (find.text('Gullak').evaluate().isNotEmpty &&
        find.text('Continue').evaluate().isNotEmpty) {
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle(const Duration(seconds: 2));
    }

    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();

    for (final digit in ['9', '8', '7']) {
      await tester.tap(find.text(digit).last);
      await tester.pumpAndSettle();
    }
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(find.text('-₹987.00'), findsWidgets);

    await tester.tap(find.text('Activity'));
    await tester.pumpAndSettle();
    expect(find.text('-₹987.00'), findsWidgets);

    await tester.drag(find.byType(Slidable).first, const Offset(-500, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(find.text('Undo'), findsOneWidget);

    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle(const Duration(seconds: 2));
    expect(find.text('-₹987.00'), findsWidgets);
  });
}
