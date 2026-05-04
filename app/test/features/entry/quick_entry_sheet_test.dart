import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/core/prefs.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/features/accounts/data/account_repository.dart';
import 'package:gullak/features/categories/data/category_repository.dart';
import 'package:gullak/features/entry/quick_entry_sheet.dart';
import 'package:gullak/features/payees/data/payee_repository.dart';
import 'package:gullak/features/transactions/data/transaction_repository.dart';
import 'package:gullak/state/providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late AppDatabase db;
  late Prefs prefs;
  late AccountRow account;
  late CategoryRow groceries;
  late CategoryRow transport;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await Prefs.load();
    db = AppDatabase.forTesting(NativeDatabase.memory());
    final accountRepo = AccountRepository(db);
    final accountId = await accountRepo.create(
      name: 'Main',
      kind: AccountKind.checking,
    );
    account = (await accountRepo.byId(accountId))!;
    final categoryRepo = CategoryRepository(db);
    final groupId = await categoryRepo.createGroup(name: 'Everyday');
    groceries = (await categoryRepo.byId(
      await categoryRepo.create(name: 'Groceries', groupId: groupId),
    ))!;
    transport = (await categoryRepo.byId(
      await categoryRepo.create(name: 'Transport', groupId: groupId),
    ))!;
    await PayeeRepository(db).create('Blinkit');
  });

  tearDown(() => db.close());

  Widget quickEntryUnderTest({String? editingTransactionId}) {
    return ProviderScope(
      overrides: [
        dbProvider.overrideWithValue(db),
        prefsProvider.overrideWithValue(prefs),
        accountsListProvider.overrideWith((ref) => Stream.value([account])),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: QuickEntrySheet(editingTransactionId: editingTransactionId),
        ),
      ),
    );
  }

  Future<void> showFormTab(WidgetTester tester) async {
    final form = find.text('Form');
    if (form.evaluate().isNotEmpty) {
      await tester.tap(form);
      await tester.pumpAndSettle();
    }
  }

  Future<void> scrollUntilTextVisible(WidgetTester tester, String text) async {
    final finder = find.text(text);
    if (finder.evaluate().isNotEmpty) return;
    final scrollable = find.byType(Scrollable);
    for (var i = 0; i < 12 && finder.evaluate().isEmpty; i++) {
      if (scrollable.evaluate().isEmpty) break;
      await tester.drag(scrollable.first, const Offset(0, -120));
      await tester.pumpAndSettle();
    }
  }

  testWidgets('split-second double tap on Save creates one transaction', (
    tester,
  ) async {
    await tester.pumpWidget(quickEntryUnderTest());
    await tester.pumpAndSettle();

    for (final digit in ['1', '2', '3']) {
      await tester.tap(find.text(digit).last);
      await tester.pump();
    }

    final save = find.widgetWithText(FilledButton, 'Save');
    expect(save, findsOneWidget);
    await tester.tap(save);
    await tester.tap(save);
    await tester.pumpAndSettle();

    final rows = await db.select(db.transactions).get();
    expect(rows, hasLength(1));
    expect(rows.single.amountCents, -12300);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('hides keypad when note field opens the system keyboard', (
    tester,
  ) async {
    await tester.pumpWidget(quickEntryUnderTest());
    await tester.pumpAndSettle();

    expect(find.text('00'), findsOneWidget);
    expect(find.text('⌫'), findsOneWidget);

    tester.view.viewInsets = const FakeViewPadding(bottom: 900);
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.text('00'), findsNothing);
    expect(find.text('⌫'), findsNothing);

    await tester.pumpWidget(const SizedBox.shrink());
    tester.view.resetViewInsets();
    await tester.pump();
  });

  testWidgets('category picker has search and filters categories', (
    tester,
  ) async {
    await tester.pumpWidget(quickEntryUnderTest());
    await tester.pumpAndSettle();
    await showFormTab(tester);
    await scrollUntilTextVisible(tester, 'Category');

    await tester.tap(find.text('Category'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(TextField, 'Search categories'), findsOneWidget);
    expect(find.text(groceries.name), findsOneWidget);
    expect(find.text(transport.name), findsOneWidget);

    await tester.enterText(
      find.widgetWithText(TextField, 'Search categories'),
      'trans',
    );
    await tester.pumpAndSettle();

    expect(find.text(groceries.name), findsNothing);
    expect(find.text(transport.name), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('date row only exposes Today Yesterday and picker controls', (
    tester,
  ) async {
    await tester.pumpWidget(quickEntryUnderTest());
    await tester.pumpAndSettle();
    await showFormTab(tester);
    await scrollUntilTextVisible(tester, 'Today');

    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Yesterday'), findsOneWidget);
    expect(
      find.text('Pick').evaluate().isNotEmpty ||
          find.byTooltip('Pick date').evaluate().isNotEmpty,
      isTrue,
    );
    expect(find.textContaining(RegExp(r'\d+d ago')), findsNothing);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('Add note keeps a 48dp minimum tap target', (tester) async {
    await tester.pumpWidget(quickEntryUnderTest());
    await tester.pumpAndSettle();
    await showFormTab(tester);
    await scrollUntilTextVisible(tester, 'Add note');

    final addNote = find.widgetWithText(TextButton, 'Add note');
    expect(addNote, findsOneWidget);
    expect(tester.getSize(addNote).height, greaterThanOrEqualTo(48));

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('edit mode hydrates existing amount category payee and note', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1;
    final payeeId = await PayeeRepository(db).create('Zomato');
    final txId = await TransactionRepository(db).create(
      accountId: account.id,
      categoryId: groceries.id,
      payeeId: payeeId,
      amountCents: -98700,
      date: DateTime(2026, 5, 2),
      notes: 'late dinner',
    );

    await tester.pumpWidget(quickEntryUnderTest(editingTransactionId: txId));
    await tester.pumpAndSettle();

    expect(find.text('987'), findsOneWidget);
    await scrollUntilTextVisible(tester, groceries.name);
    expect(find.text(groceries.name), findsOneWidget);
    await scrollUntilTextVisible(tester, 'Zomato');
    expect(find.text('Zomato'), findsOneWidget);
    await scrollUntilTextVisible(tester, 'late dinner');
    expect(find.text('late dinner'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
    await tester.pump();
  });
}
