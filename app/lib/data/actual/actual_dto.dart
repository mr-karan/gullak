/// Plain data carriers for actual-http-api responses. Hand-written
/// to keep codegen surface small.
class BudgetDto {
  const BudgetDto({
    required this.syncId,
    required this.name,
    required this.encryptKeyId,
  });

  final String syncId;
  final String name;
  final String? encryptKeyId;

  factory BudgetDto.fromJson(Map<String, dynamic> j) => BudgetDto(
        syncId: (j['cloudFileId'] ?? j['groupId'] ?? j['syncId'] ?? '') as String,
        name: (j['name'] ?? '') as String,
        encryptKeyId: j['encryptKeyId'] as String?,
      );
}

class ActualAccountDto {
  const ActualAccountDto({
    required this.id,
    required this.name,
    required this.offbudget,
    required this.closed,
    this.sortOrder = 0,
    this.balance,
  });

  final String id;
  final String name;
  final bool offbudget;
  final bool closed;
  final int sortOrder;
  final int? balance;

  factory ActualAccountDto.fromJson(Map<String, dynamic> j) {
    return ActualAccountDto(
      id: j['id'] as String,
      name: (j['name'] ?? '') as String,
      offbudget: (j['offbudget'] ?? 0) is bool
          ? j['offbudget'] as bool
          : (j['offbudget'] as int? ?? 0) != 0,
      closed: (j['closed'] ?? 0) is bool
          ? j['closed'] as bool
          : (j['closed'] as int? ?? 0) != 0,
      sortOrder: (j['sort_order'] as num?)?.toInt() ?? 0,
      balance: (j['balance'] as num?)?.toInt(),
    );
  }
}

class ActualCategoryGroupDto {
  const ActualCategoryGroupDto({
    required this.id,
    required this.name,
    required this.isIncome,
    this.categories = const [],
    this.sortOrder = 0,
  });

  final String id;
  final String name;
  final bool isIncome;
  final List<ActualCategoryDto> categories;
  final int sortOrder;

  factory ActualCategoryGroupDto.fromJson(Map<String, dynamic> j) {
    final cats = (j['categories'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(ActualCategoryDto.fromJson)
        .toList();
    return ActualCategoryGroupDto(
      id: j['id'] as String,
      name: (j['name'] ?? '') as String,
      isIncome: (j['is_income'] ?? 0) is bool
          ? j['is_income'] as bool
          : (j['is_income'] as int? ?? 0) != 0,
      categories: cats,
      sortOrder: (j['sort_order'] as num?)?.toInt() ?? 0,
    );
  }
}

class ActualCategoryDto {
  const ActualCategoryDto({
    required this.id,
    required this.name,
    required this.groupId,
    required this.isIncome,
    required this.hidden,
    this.sortOrder = 0,
  });

  final String id;
  final String name;
  final String groupId;
  final bool isIncome;
  final bool hidden;
  final int sortOrder;

  factory ActualCategoryDto.fromJson(Map<String, dynamic> j) {
    return ActualCategoryDto(
      id: j['id'] as String,
      name: (j['name'] ?? '') as String,
      groupId: (j['group_id'] ?? j['cat_group'] ?? '') as String,
      isIncome: (j['is_income'] ?? 0) is bool
          ? j['is_income'] as bool
          : (j['is_income'] as int? ?? 0) != 0,
      hidden: (j['hidden'] ?? 0) is bool
          ? j['hidden'] as bool
          : (j['hidden'] as int? ?? 0) != 0,
      sortOrder: (j['sort_order'] as num?)?.toInt() ?? 0,
    );
  }
}

class ActualPayeeDto {
  const ActualPayeeDto({
    required this.id,
    required this.name,
    this.transferAcct,
  });

  final String id;
  final String name;
  final String? transferAcct;

  factory ActualPayeeDto.fromJson(Map<String, dynamic> j) {
    return ActualPayeeDto(
      id: j['id'] as String,
      name: (j['name'] ?? '') as String,
      transferAcct: j['transfer_acct'] as String?,
    );
  }
}

class ActualTransactionDto {
  const ActualTransactionDto({
    required this.id,
    required this.account,
    required this.date,
    required this.amount,
    this.payee,
    this.payeeName,
    this.category,
    this.notes,
    this.importedId,
    this.cleared = false,
  });

  final String id;
  final String account;
  final String date; // YYYY-MM-DD
  final int amount; // negative for spend
  final String? payee;
  final String? payeeName;
  final String? category;
  final String? notes;
  final String? importedId;
  final bool cleared;

  factory ActualTransactionDto.fromJson(Map<String, dynamic> j) {
    return ActualTransactionDto(
      id: (j['id'] ?? '') as String,
      account: (j['account'] ?? '') as String,
      date: (j['date'] ?? '') as String,
      amount: (j['amount'] as num?)?.toInt() ?? 0,
      payee: j['payee'] as String?,
      payeeName: j['payee_name'] as String?,
      category: j['category'] as String?,
      notes: j['notes'] as String?,
      importedId: j['imported_id'] as String?,
      cleared: (j['cleared'] ?? 0) is bool
          ? j['cleared'] as bool
          : (j['cleared'] as int? ?? 0) != 0,
    );
  }

  Map<String, dynamic> toJsonForCreate() {
    final m = <String, dynamic>{
      'account': account,
      'date': date,
      'amount': amount,
      'cleared': cleared,
    };
    if (payee != null) m['payee'] = payee;
    if (payeeName != null) m['payee_name'] = payeeName;
    if (category != null) m['category'] = category;
    if (notes != null) m['notes'] = notes;
    if (importedId != null) m['imported_id'] = importedId;
    return m;
  }
}
