import 'dart:math';

import '../core/dates.dart';
import '../core/prefs.dart';
import '../features/accounts/data/account_repository.dart';
import '../features/budgets/data/budget_repository.dart';
import '../features/categories/category_visuals.dart';
import '../features/categories/data/category_repository.dart';
import '../features/payees/data/payee_repository.dart';
import '../features/transactions/data/transaction_repository.dart';
import 'db/database.dart';

/// Compile-time demo flag. Builds with `--dart-define=GULLAK_DEMO=true`
/// seed tasteful fake data on first launch (see [seedDemoData]); normal
/// builds leave this `false` and the tree-shaker drops the seed entirely.
const bool kDemoMode = bool.fromEnvironment('GULLAK_DEMO');

/// Populate an empty database with a believable expense history so
/// store/F-Droid screenshots look alive without needing a real device or
/// hand-entered data.
///
/// Idempotent: no-ops if any account already exists, so a warm demo build
/// keeps whatever you were showing. All dates are RELATIVE to
/// `DateTime.now()` via [ymd] so screenshots stay fresh whenever they're
/// captured. Money is integer paise. Expenses are stored NEGATIVE and income
/// POSITIVE, matching the transaction repository's sign convention.
///
/// Not wired to the sync change-log — demo data is local-only and never
/// pushed to a server.
Future<void> seedDemoData(AppDatabase db, Prefs prefs) async {
  final accountRepo = AccountRepository(db);
  final existing = await accountRepo.list(includeArchived: true);
  if (existing.isNotEmpty) return;

  // Deterministic RNG so a re-seed after clear-data produces the same set —
  // predictable screenshots across runs.
  final rng = Random(42);

  await prefs.setCurrencySymbol('₹');
  await prefs.setCurrencyMinorDigits(2);

  // ── Accounts ──────────────────────────────────────────────────────────
  final hdfc = await accountRepo.create(
    name: 'HDFC Bank',
    kind: AccountKind.savings,
    openingBalanceCents: 18742300, // ₹1,87,423.00
  );
  final icici = await accountRepo.create(
    name: 'ICICI Credit Card',
    kind: AccountKind.creditCard,
    openingBalanceCents: -2431500, // ₹24,315.00 outstanding
  );
  final cash = await accountRepo.create(
    name: 'Cash',
    kind: AccountKind.cash,
    openingBalanceCents: 350000, // ₹3,500.00
  );

  // ── Categories (mirror onboarding's _seedDefaults) ───────────────────────
  final catRepo = CategoryRepository(db);
  final daily = await catRepo.createGroup(name: 'Daily Living');
  final lifestyle = await catRepo.createGroup(name: 'Lifestyle');
  final fixed = await catRepo.createGroup(name: 'Fixed Costs');
  final savings = await catRepo.createGroup(name: 'Savings & Goals');
  final income = await catRepo.createGroup(name: 'Income', isIncome: true);

  final catId = <String, String>{};
  Future<void> addCat(String group, String name) async {
    catId[name] = await catRepo.create(
      name: name,
      groupId: group,
      icon: defaultCategoryEmoji(name),
    );
  }

  await addCat(daily, 'Groceries');
  await addCat(daily, 'Transport');
  await addCat(daily, 'Phone & Internet');
  await addCat(daily, 'Health');
  await addCat(lifestyle, 'Eating Out');
  await addCat(lifestyle, 'Entertainment');
  await addCat(lifestyle, 'Shopping');
  await addCat(lifestyle, 'Travel');
  await addCat(fixed, 'Rent');
  await addCat(fixed, 'Utilities');
  await addCat(fixed, 'Insurance');
  await addCat(fixed, 'Subscriptions');
  await addCat(savings, 'Emergency Fund');
  await addCat(savings, 'Investments');
  await addCat(income, 'Salary');
  await addCat(income, 'Other Income');

  // ── Payees ───────────────────────────────────────────────────────────
  final payeeRepo = PayeeRepository(db);
  final payeeId = <String, String>{};
  for (final name in const [
    'Blinkit',
    'Swiggy',
    'Zomato',
    'Uber',
    'Big Bazaar',
    'Netflix',
    'Airtel',
    'Sunrise Apartments',
    'Coffee House',
    'Amazon',
  ]) {
    payeeId[name] = await payeeRepo.create(name);
  }

  // ── Transactions ───────────────────────────────────────────────────────
  final txRepo = TransactionRepository(db);
  final now = DateTime.now();
  DateTime daysAgo(int d) => DateTime(now.year, now.month, now.day - d);

  // paise amount within an inclusive rupee range.
  int paise(int minRupees, int maxRupees) =>
      (minRupees + rng.nextInt(maxRupees - minRupees + 1)) * 100;

  Future<void> spend({
    required String account,
    required String category,
    String? payee,
    required int amountPaise,
    required int dayOffset,
    String? notes,
  }) async {
    await txRepo.create(
      accountId: account,
      categoryId: catId[category],
      payeeId: payee == null ? null : payeeId[payee],
      payeeName: payee,
      amountCents: -amountPaise, // expenses are negative
      date: daysAgo(dayOffset),
      notes: notes,
    );
  }

  Future<void> earn({
    required String account,
    required String category,
    String? payee,
    required int amountPaise,
    required int dayOffset,
    String? notes,
  }) async {
    await txRepo.create(
      accountId: account,
      categoryId: catId[category],
      payeeName: payee,
      amountCents: amountPaise, // income is positive
      date: daysAgo(dayOffset),
      notes: notes,
    );
  }

  // Salary credit ~30 days ago and again on last month's cycle end.
  await earn(
    account: hdfc,
    category: 'Salary',
    payee: 'Acme Corp Payroll',
    amountPaise: 15000000, // ₹1,50,000
    dayOffset: 30,
    notes: 'Monthly salary',
  );

  // Rent, once, near the start of the current cycle.
  await spend(
    account: hdfc,
    category: 'Rent',
    payee: 'Sunrise Apartments',
    amountPaise: 2200000, // ₹22,000
    dayOffset: 28,
    notes: 'Flat 402 rent',
  );

  // Fixed monthly-ish costs.
  await spend(
    account: hdfc,
    category: 'Phone & Internet',
    payee: 'Airtel',
    amountPaise: 99900,
    dayOffset: 26,
    notes: 'Broadband + mobile',
  );
  await spend(
    account: icici,
    category: 'Subscriptions',
    payee: 'Netflix',
    amountPaise: 64900,
    dayOffset: 21,
  );
  await spend(
    account: hdfc,
    category: 'Utilities',
    amountPaise: paise(1400, 2600),
    dayOffset: 19,
    notes: 'Electricity bill',
  );

  // Grocery runs across the window.
  const groceryPayees = ['Blinkit', 'Big Bazaar', 'Amazon'];
  for (final d in const [2, 6, 11, 17, 23, 31, 38]) {
    await spend(
      account: rng.nextBool() ? hdfc : icici,
      category: 'Groceries',
      payee: groceryPayees[rng.nextInt(groceryPayees.length)],
      amountPaise: paise(300, 1500),
      dayOffset: d,
    );
  }

  // Dining out — Swiggy / Zomato / Coffee House.
  const diningPayees = ['Swiggy', 'Zomato', 'Coffee House'];
  for (final d in const [1, 3, 4, 8, 10, 14, 16, 20, 25, 29, 33, 40]) {
    final p = diningPayees[rng.nextInt(diningPayees.length)];
    await spend(
      account: rng.nextBool() ? icici : cash,
      category: 'Eating Out',
      payee: p,
      amountPaise: p == 'Coffee House' ? paise(150, 400) : paise(200, 800),
      dayOffset: d,
    );
  }

  // Transport — Uber + fuel.
  for (final d in const [2, 5, 9, 13, 18, 24, 30, 36, 42]) {
    final isFuel = rng.nextInt(3) == 0;
    await spend(
      account: isFuel ? hdfc : icici,
      category: 'Transport',
      payee: isFuel ? null : 'Uber',
      amountPaise: isFuel ? paise(1800, 3200) : paise(120, 550),
      dayOffset: d,
      notes: isFuel ? 'Fuel' : null,
    );
  }

  // Shopping.
  for (final d in const [7, 15, 27, 35]) {
    await spend(
      account: icici,
      category: 'Shopping',
      payee: 'Amazon',
      amountPaise: paise(500, 4500),
      dayOffset: d,
    );
  }

  // Entertainment.
  for (final d in const [12, 22, 34]) {
    await spend(
      account: rng.nextBool() ? icici : cash,
      category: 'Entertainment',
      amountPaise: paise(300, 1200),
      dayOffset: d,
      notes: rng.nextBool() ? 'Movie night' : null,
    );
  }

  // Health.
  for (final d in const [9, 32]) {
    await spend(
      account: hdfc,
      category: 'Health',
      amountPaise: paise(400, 2200),
      dayOffset: d,
      notes: 'Pharmacy',
    );
  }

  // A small "other income" refund.
  await earn(
    account: hdfc,
    category: 'Other Income',
    payee: 'Amazon',
    amountPaise: 129900,
    dayOffset: 13,
    notes: 'Order refund',
  );

  // A couple of transfers between accounts (double-entry, self-balancing).
  await txRepo.createTransfer(
    fromAccountId: hdfc,
    toAccountId: cash,
    amountCents: 500000, // ₹5,000 ATM withdrawal
    date: daysAgo(15),
    notes: 'ATM withdrawal',
  );
  await txRepo.createTransfer(
    fromAccountId: hdfc,
    toAccountId: icici,
    amountCents: 1500000, // ₹15,000 card bill payment
    date: daysAgo(5),
    notes: 'Credit card payment',
  );

  // ── Budgets (current month, so rings render) ─────────────────────────────
  final month = BudgetRepository.monthOf(now);
  final budgetRepo = BudgetRepository(db);
  Future<void> target(String category, int rupees) => budgetRepo.setTarget(
    categoryId: catId[category]!,
    month: month,
    targetCents: rupees * 100,
  );
  await target('Groceries', 8000);
  await target('Eating Out', 6000);
  await target('Transport', 5000);
  await target('Shopping', 7000);
  await target('Entertainment', 3000);

  // Mark onboarded LAST — same ordering onboarding uses so any watcher that
  // gates on it sees a fully-populated DB.
  await db.kvSet('onboarded', 'true');
  await db.kvSet('seeded', 'true');
}
