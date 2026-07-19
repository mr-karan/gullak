// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $AccountsTable extends Accounts
    with TableInfo<$AccountsTable, AccountRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AccountsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
    'kind',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('checking'),
  );
  static const VerificationMeta _openingBalanceCentsMeta =
      const VerificationMeta('openingBalanceCents');
  @override
  late final GeneratedColumn<int> openingBalanceCents = GeneratedColumn<int>(
    'opening_balance_cents',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _reconciledBalanceCentsMeta =
      const VerificationMeta('reconciledBalanceCents');
  @override
  late final GeneratedColumn<int> reconciledBalanceCents = GeneratedColumn<int>(
    'reconciled_balance_cents',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _reconciledAtMeta = const VerificationMeta(
    'reconciledAt',
  );
  @override
  late final GeneratedColumn<int> reconciledAt = GeneratedColumn<int>(
    'reconciled_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _onBudgetMeta = const VerificationMeta(
    'onBudget',
  );
  @override
  late final GeneratedColumn<bool> onBudget = GeneratedColumn<bool>(
    'on_budget',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("on_budget" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  static const VerificationMeta _archivedMeta = const VerificationMeta(
    'archived',
  );
  @override
  late final GeneratedColumn<bool> archived = GeneratedColumn<bool>(
    'archived',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("archived" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _sortOrderMeta = const VerificationMeta(
    'sortOrder',
  );
  @override
  late final GeneratedColumn<int> sortOrder = GeneratedColumn<int>(
    'sort_order',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    name,
    kind,
    openingBalanceCents,
    reconciledBalanceCents,
    reconciledAt,
    onBudget,
    archived,
    sortOrder,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'accounts';
  @override
  VerificationContext validateIntegrity(
    Insertable<AccountRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('kind')) {
      context.handle(
        _kindMeta,
        kind.isAcceptableOrUnknown(data['kind']!, _kindMeta),
      );
    }
    if (data.containsKey('opening_balance_cents')) {
      context.handle(
        _openingBalanceCentsMeta,
        openingBalanceCents.isAcceptableOrUnknown(
          data['opening_balance_cents']!,
          _openingBalanceCentsMeta,
        ),
      );
    }
    if (data.containsKey('reconciled_balance_cents')) {
      context.handle(
        _reconciledBalanceCentsMeta,
        reconciledBalanceCents.isAcceptableOrUnknown(
          data['reconciled_balance_cents']!,
          _reconciledBalanceCentsMeta,
        ),
      );
    }
    if (data.containsKey('reconciled_at')) {
      context.handle(
        _reconciledAtMeta,
        reconciledAt.isAcceptableOrUnknown(
          data['reconciled_at']!,
          _reconciledAtMeta,
        ),
      );
    }
    if (data.containsKey('on_budget')) {
      context.handle(
        _onBudgetMeta,
        onBudget.isAcceptableOrUnknown(data['on_budget']!, _onBudgetMeta),
      );
    }
    if (data.containsKey('archived')) {
      context.handle(
        _archivedMeta,
        archived.isAcceptableOrUnknown(data['archived']!, _archivedMeta),
      );
    }
    if (data.containsKey('sort_order')) {
      context.handle(
        _sortOrderMeta,
        sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  AccountRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return AccountRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      kind: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}kind'],
      )!,
      openingBalanceCents: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}opening_balance_cents'],
      )!,
      reconciledBalanceCents: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}reconciled_balance_cents'],
      ),
      reconciledAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}reconciled_at'],
      ),
      onBudget: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}on_budget'],
      )!,
      archived: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}archived'],
      )!,
      sortOrder: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sort_order'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $AccountsTable createAlias(String alias) {
    return $AccountsTable(attachedDatabase, alias);
  }
}

class AccountRow extends DataClass implements Insertable<AccountRow> {
  final String id;
  final String name;
  final String kind;
  final int openingBalanceCents;
  final int? reconciledBalanceCents;
  final int? reconciledAt;
  final bool onBudget;
  final bool archived;
  final int sortOrder;
  final int createdAt;
  final int updatedAt;
  const AccountRow({
    required this.id,
    required this.name,
    required this.kind,
    required this.openingBalanceCents,
    this.reconciledBalanceCents,
    this.reconciledAt,
    required this.onBudget,
    required this.archived,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    map['kind'] = Variable<String>(kind);
    map['opening_balance_cents'] = Variable<int>(openingBalanceCents);
    if (!nullToAbsent || reconciledBalanceCents != null) {
      map['reconciled_balance_cents'] = Variable<int>(reconciledBalanceCents);
    }
    if (!nullToAbsent || reconciledAt != null) {
      map['reconciled_at'] = Variable<int>(reconciledAt);
    }
    map['on_budget'] = Variable<bool>(onBudget);
    map['archived'] = Variable<bool>(archived);
    map['sort_order'] = Variable<int>(sortOrder);
    map['created_at'] = Variable<int>(createdAt);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  AccountsCompanion toCompanion(bool nullToAbsent) {
    return AccountsCompanion(
      id: Value(id),
      name: Value(name),
      kind: Value(kind),
      openingBalanceCents: Value(openingBalanceCents),
      reconciledBalanceCents: reconciledBalanceCents == null && nullToAbsent
          ? const Value.absent()
          : Value(reconciledBalanceCents),
      reconciledAt: reconciledAt == null && nullToAbsent
          ? const Value.absent()
          : Value(reconciledAt),
      onBudget: Value(onBudget),
      archived: Value(archived),
      sortOrder: Value(sortOrder),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory AccountRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return AccountRow(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      kind: serializer.fromJson<String>(json['kind']),
      openingBalanceCents: serializer.fromJson<int>(
        json['openingBalanceCents'],
      ),
      reconciledBalanceCents: serializer.fromJson<int?>(
        json['reconciledBalanceCents'],
      ),
      reconciledAt: serializer.fromJson<int?>(json['reconciledAt']),
      onBudget: serializer.fromJson<bool>(json['onBudget']),
      archived: serializer.fromJson<bool>(json['archived']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'kind': serializer.toJson<String>(kind),
      'openingBalanceCents': serializer.toJson<int>(openingBalanceCents),
      'reconciledBalanceCents': serializer.toJson<int?>(reconciledBalanceCents),
      'reconciledAt': serializer.toJson<int?>(reconciledAt),
      'onBudget': serializer.toJson<bool>(onBudget),
      'archived': serializer.toJson<bool>(archived),
      'sortOrder': serializer.toJson<int>(sortOrder),
      'createdAt': serializer.toJson<int>(createdAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  AccountRow copyWith({
    String? id,
    String? name,
    String? kind,
    int? openingBalanceCents,
    Value<int?> reconciledBalanceCents = const Value.absent(),
    Value<int?> reconciledAt = const Value.absent(),
    bool? onBudget,
    bool? archived,
    int? sortOrder,
    int? createdAt,
    int? updatedAt,
  }) => AccountRow(
    id: id ?? this.id,
    name: name ?? this.name,
    kind: kind ?? this.kind,
    openingBalanceCents: openingBalanceCents ?? this.openingBalanceCents,
    reconciledBalanceCents: reconciledBalanceCents.present
        ? reconciledBalanceCents.value
        : this.reconciledBalanceCents,
    reconciledAt: reconciledAt.present ? reconciledAt.value : this.reconciledAt,
    onBudget: onBudget ?? this.onBudget,
    archived: archived ?? this.archived,
    sortOrder: sortOrder ?? this.sortOrder,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  AccountRow copyWithCompanion(AccountsCompanion data) {
    return AccountRow(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      kind: data.kind.present ? data.kind.value : this.kind,
      openingBalanceCents: data.openingBalanceCents.present
          ? data.openingBalanceCents.value
          : this.openingBalanceCents,
      reconciledBalanceCents: data.reconciledBalanceCents.present
          ? data.reconciledBalanceCents.value
          : this.reconciledBalanceCents,
      reconciledAt: data.reconciledAt.present
          ? data.reconciledAt.value
          : this.reconciledAt,
      onBudget: data.onBudget.present ? data.onBudget.value : this.onBudget,
      archived: data.archived.present ? data.archived.value : this.archived,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('AccountRow(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('kind: $kind, ')
          ..write('openingBalanceCents: $openingBalanceCents, ')
          ..write('reconciledBalanceCents: $reconciledBalanceCents, ')
          ..write('reconciledAt: $reconciledAt, ')
          ..write('onBudget: $onBudget, ')
          ..write('archived: $archived, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    name,
    kind,
    openingBalanceCents,
    reconciledBalanceCents,
    reconciledAt,
    onBudget,
    archived,
    sortOrder,
    createdAt,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is AccountRow &&
          other.id == this.id &&
          other.name == this.name &&
          other.kind == this.kind &&
          other.openingBalanceCents == this.openingBalanceCents &&
          other.reconciledBalanceCents == this.reconciledBalanceCents &&
          other.reconciledAt == this.reconciledAt &&
          other.onBudget == this.onBudget &&
          other.archived == this.archived &&
          other.sortOrder == this.sortOrder &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class AccountsCompanion extends UpdateCompanion<AccountRow> {
  final Value<String> id;
  final Value<String> name;
  final Value<String> kind;
  final Value<int> openingBalanceCents;
  final Value<int?> reconciledBalanceCents;
  final Value<int?> reconciledAt;
  final Value<bool> onBudget;
  final Value<bool> archived;
  final Value<int> sortOrder;
  final Value<int> createdAt;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const AccountsCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.kind = const Value.absent(),
    this.openingBalanceCents = const Value.absent(),
    this.reconciledBalanceCents = const Value.absent(),
    this.reconciledAt = const Value.absent(),
    this.onBudget = const Value.absent(),
    this.archived = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AccountsCompanion.insert({
    required String id,
    required String name,
    this.kind = const Value.absent(),
    this.openingBalanceCents = const Value.absent(),
    this.reconciledBalanceCents = const Value.absent(),
    this.reconciledAt = const Value.absent(),
    this.onBudget = const Value.absent(),
    this.archived = const Value.absent(),
    this.sortOrder = const Value.absent(),
    required int createdAt,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<AccountRow> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<String>? kind,
    Expression<int>? openingBalanceCents,
    Expression<int>? reconciledBalanceCents,
    Expression<int>? reconciledAt,
    Expression<bool>? onBudget,
    Expression<bool>? archived,
    Expression<int>? sortOrder,
    Expression<int>? createdAt,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (kind != null) 'kind': kind,
      if (openingBalanceCents != null)
        'opening_balance_cents': openingBalanceCents,
      if (reconciledBalanceCents != null)
        'reconciled_balance_cents': reconciledBalanceCents,
      if (reconciledAt != null) 'reconciled_at': reconciledAt,
      if (onBudget != null) 'on_budget': onBudget,
      if (archived != null) 'archived': archived,
      if (sortOrder != null) 'sort_order': sortOrder,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AccountsCompanion copyWith({
    Value<String>? id,
    Value<String>? name,
    Value<String>? kind,
    Value<int>? openingBalanceCents,
    Value<int?>? reconciledBalanceCents,
    Value<int?>? reconciledAt,
    Value<bool>? onBudget,
    Value<bool>? archived,
    Value<int>? sortOrder,
    Value<int>? createdAt,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return AccountsCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      kind: kind ?? this.kind,
      openingBalanceCents: openingBalanceCents ?? this.openingBalanceCents,
      reconciledBalanceCents:
          reconciledBalanceCents ?? this.reconciledBalanceCents,
      reconciledAt: reconciledAt ?? this.reconciledAt,
      onBudget: onBudget ?? this.onBudget,
      archived: archived ?? this.archived,
      sortOrder: sortOrder ?? this.sortOrder,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (openingBalanceCents.present) {
      map['opening_balance_cents'] = Variable<int>(openingBalanceCents.value);
    }
    if (reconciledBalanceCents.present) {
      map['reconciled_balance_cents'] = Variable<int>(
        reconciledBalanceCents.value,
      );
    }
    if (reconciledAt.present) {
      map['reconciled_at'] = Variable<int>(reconciledAt.value);
    }
    if (onBudget.present) {
      map['on_budget'] = Variable<bool>(onBudget.value);
    }
    if (archived.present) {
      map['archived'] = Variable<bool>(archived.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<int>(sortOrder.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AccountsCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('kind: $kind, ')
          ..write('openingBalanceCents: $openingBalanceCents, ')
          ..write('reconciledBalanceCents: $reconciledBalanceCents, ')
          ..write('reconciledAt: $reconciledAt, ')
          ..write('onBudget: $onBudget, ')
          ..write('archived: $archived, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CategoryGroupsTable extends CategoryGroups
    with TableInfo<$CategoryGroupsTable, CategoryGroupRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CategoryGroupsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _isIncomeMeta = const VerificationMeta(
    'isIncome',
  );
  @override
  late final GeneratedColumn<bool> isIncome = GeneratedColumn<bool>(
    'is_income',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_income" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _sortOrderMeta = const VerificationMeta(
    'sortOrder',
  );
  @override
  late final GeneratedColumn<int> sortOrder = GeneratedColumn<int>(
    'sort_order',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  @override
  List<GeneratedColumn> get $columns => [id, name, isIncome, sortOrder];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'category_groups';
  @override
  VerificationContext validateIntegrity(
    Insertable<CategoryGroupRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('is_income')) {
      context.handle(
        _isIncomeMeta,
        isIncome.isAcceptableOrUnknown(data['is_income']!, _isIncomeMeta),
      );
    }
    if (data.containsKey('sort_order')) {
      context.handle(
        _sortOrderMeta,
        sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CategoryGroupRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CategoryGroupRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      isIncome: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_income'],
      )!,
      sortOrder: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sort_order'],
      )!,
    );
  }

  @override
  $CategoryGroupsTable createAlias(String alias) {
    return $CategoryGroupsTable(attachedDatabase, alias);
  }
}

class CategoryGroupRow extends DataClass
    implements Insertable<CategoryGroupRow> {
  final String id;
  final String name;
  final bool isIncome;
  final int sortOrder;
  const CategoryGroupRow({
    required this.id,
    required this.name,
    required this.isIncome,
    required this.sortOrder,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    map['is_income'] = Variable<bool>(isIncome);
    map['sort_order'] = Variable<int>(sortOrder);
    return map;
  }

  CategoryGroupsCompanion toCompanion(bool nullToAbsent) {
    return CategoryGroupsCompanion(
      id: Value(id),
      name: Value(name),
      isIncome: Value(isIncome),
      sortOrder: Value(sortOrder),
    );
  }

  factory CategoryGroupRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CategoryGroupRow(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      isIncome: serializer.fromJson<bool>(json['isIncome']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'isIncome': serializer.toJson<bool>(isIncome),
      'sortOrder': serializer.toJson<int>(sortOrder),
    };
  }

  CategoryGroupRow copyWith({
    String? id,
    String? name,
    bool? isIncome,
    int? sortOrder,
  }) => CategoryGroupRow(
    id: id ?? this.id,
    name: name ?? this.name,
    isIncome: isIncome ?? this.isIncome,
    sortOrder: sortOrder ?? this.sortOrder,
  );
  CategoryGroupRow copyWithCompanion(CategoryGroupsCompanion data) {
    return CategoryGroupRow(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      isIncome: data.isIncome.present ? data.isIncome.value : this.isIncome,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CategoryGroupRow(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('isIncome: $isIncome, ')
          ..write('sortOrder: $sortOrder')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, name, isIncome, sortOrder);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CategoryGroupRow &&
          other.id == this.id &&
          other.name == this.name &&
          other.isIncome == this.isIncome &&
          other.sortOrder == this.sortOrder);
}

class CategoryGroupsCompanion extends UpdateCompanion<CategoryGroupRow> {
  final Value<String> id;
  final Value<String> name;
  final Value<bool> isIncome;
  final Value<int> sortOrder;
  final Value<int> rowid;
  const CategoryGroupsCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.isIncome = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CategoryGroupsCompanion.insert({
    required String id,
    required String name,
    this.isIncome = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name);
  static Insertable<CategoryGroupRow> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<bool>? isIncome,
    Expression<int>? sortOrder,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (isIncome != null) 'is_income': isIncome,
      if (sortOrder != null) 'sort_order': sortOrder,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CategoryGroupsCompanion copyWith({
    Value<String>? id,
    Value<String>? name,
    Value<bool>? isIncome,
    Value<int>? sortOrder,
    Value<int>? rowid,
  }) {
    return CategoryGroupsCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      isIncome: isIncome ?? this.isIncome,
      sortOrder: sortOrder ?? this.sortOrder,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (isIncome.present) {
      map['is_income'] = Variable<bool>(isIncome.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<int>(sortOrder.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CategoryGroupsCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('isIncome: $isIncome, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CategoriesTable extends Categories
    with TableInfo<$CategoriesTable, CategoryRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CategoriesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _groupIdMeta = const VerificationMeta(
    'groupId',
  );
  @override
  late final GeneratedColumn<String> groupId = GeneratedColumn<String>(
    'group_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _parentIdMeta = const VerificationMeta(
    'parentId',
  );
  @override
  late final GeneratedColumn<String> parentId = GeneratedColumn<String>(
    'parent_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _colorMeta = const VerificationMeta('color');
  @override
  late final GeneratedColumn<int> color = GeneratedColumn<int>(
    'color',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _iconMeta = const VerificationMeta('icon');
  @override
  late final GeneratedColumn<String> icon = GeneratedColumn<String>(
    'icon',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _hiddenMeta = const VerificationMeta('hidden');
  @override
  late final GeneratedColumn<bool> hidden = GeneratedColumn<bool>(
    'hidden',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("hidden" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _sortOrderMeta = const VerificationMeta(
    'sortOrder',
  );
  @override
  late final GeneratedColumn<int> sortOrder = GeneratedColumn<int>(
    'sort_order',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    name,
    groupId,
    parentId,
    color,
    icon,
    hidden,
    sortOrder,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'categories';
  @override
  VerificationContext validateIntegrity(
    Insertable<CategoryRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('group_id')) {
      context.handle(
        _groupIdMeta,
        groupId.isAcceptableOrUnknown(data['group_id']!, _groupIdMeta),
      );
    } else if (isInserting) {
      context.missing(_groupIdMeta);
    }
    if (data.containsKey('parent_id')) {
      context.handle(
        _parentIdMeta,
        parentId.isAcceptableOrUnknown(data['parent_id']!, _parentIdMeta),
      );
    }
    if (data.containsKey('color')) {
      context.handle(
        _colorMeta,
        color.isAcceptableOrUnknown(data['color']!, _colorMeta),
      );
    }
    if (data.containsKey('icon')) {
      context.handle(
        _iconMeta,
        icon.isAcceptableOrUnknown(data['icon']!, _iconMeta),
      );
    }
    if (data.containsKey('hidden')) {
      context.handle(
        _hiddenMeta,
        hidden.isAcceptableOrUnknown(data['hidden']!, _hiddenMeta),
      );
    }
    if (data.containsKey('sort_order')) {
      context.handle(
        _sortOrderMeta,
        sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta),
      );
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CategoryRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CategoryRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      groupId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}group_id'],
      )!,
      parentId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}parent_id'],
      ),
      color: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}color'],
      ),
      icon: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}icon'],
      ),
      hidden: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}hidden'],
      )!,
      sortOrder: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sort_order'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $CategoriesTable createAlias(String alias) {
    return $CategoriesTable(attachedDatabase, alias);
  }
}

class CategoryRow extends DataClass implements Insertable<CategoryRow> {
  final String id;
  final String name;
  final String groupId;
  final String? parentId;
  final int? color;
  final String? icon;
  final bool hidden;
  final int sortOrder;
  final int updatedAt;
  const CategoryRow({
    required this.id,
    required this.name,
    required this.groupId,
    this.parentId,
    this.color,
    this.icon,
    required this.hidden,
    required this.sortOrder,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    map['group_id'] = Variable<String>(groupId);
    if (!nullToAbsent || parentId != null) {
      map['parent_id'] = Variable<String>(parentId);
    }
    if (!nullToAbsent || color != null) {
      map['color'] = Variable<int>(color);
    }
    if (!nullToAbsent || icon != null) {
      map['icon'] = Variable<String>(icon);
    }
    map['hidden'] = Variable<bool>(hidden);
    map['sort_order'] = Variable<int>(sortOrder);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  CategoriesCompanion toCompanion(bool nullToAbsent) {
    return CategoriesCompanion(
      id: Value(id),
      name: Value(name),
      groupId: Value(groupId),
      parentId: parentId == null && nullToAbsent
          ? const Value.absent()
          : Value(parentId),
      color: color == null && nullToAbsent
          ? const Value.absent()
          : Value(color),
      icon: icon == null && nullToAbsent ? const Value.absent() : Value(icon),
      hidden: Value(hidden),
      sortOrder: Value(sortOrder),
      updatedAt: Value(updatedAt),
    );
  }

  factory CategoryRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CategoryRow(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      groupId: serializer.fromJson<String>(json['groupId']),
      parentId: serializer.fromJson<String?>(json['parentId']),
      color: serializer.fromJson<int?>(json['color']),
      icon: serializer.fromJson<String?>(json['icon']),
      hidden: serializer.fromJson<bool>(json['hidden']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'groupId': serializer.toJson<String>(groupId),
      'parentId': serializer.toJson<String?>(parentId),
      'color': serializer.toJson<int?>(color),
      'icon': serializer.toJson<String?>(icon),
      'hidden': serializer.toJson<bool>(hidden),
      'sortOrder': serializer.toJson<int>(sortOrder),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  CategoryRow copyWith({
    String? id,
    String? name,
    String? groupId,
    Value<String?> parentId = const Value.absent(),
    Value<int?> color = const Value.absent(),
    Value<String?> icon = const Value.absent(),
    bool? hidden,
    int? sortOrder,
    int? updatedAt,
  }) => CategoryRow(
    id: id ?? this.id,
    name: name ?? this.name,
    groupId: groupId ?? this.groupId,
    parentId: parentId.present ? parentId.value : this.parentId,
    color: color.present ? color.value : this.color,
    icon: icon.present ? icon.value : this.icon,
    hidden: hidden ?? this.hidden,
    sortOrder: sortOrder ?? this.sortOrder,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  CategoryRow copyWithCompanion(CategoriesCompanion data) {
    return CategoryRow(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      groupId: data.groupId.present ? data.groupId.value : this.groupId,
      parentId: data.parentId.present ? data.parentId.value : this.parentId,
      color: data.color.present ? data.color.value : this.color,
      icon: data.icon.present ? data.icon.value : this.icon,
      hidden: data.hidden.present ? data.hidden.value : this.hidden,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CategoryRow(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('groupId: $groupId, ')
          ..write('parentId: $parentId, ')
          ..write('color: $color, ')
          ..write('icon: $icon, ')
          ..write('hidden: $hidden, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    name,
    groupId,
    parentId,
    color,
    icon,
    hidden,
    sortOrder,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CategoryRow &&
          other.id == this.id &&
          other.name == this.name &&
          other.groupId == this.groupId &&
          other.parentId == this.parentId &&
          other.color == this.color &&
          other.icon == this.icon &&
          other.hidden == this.hidden &&
          other.sortOrder == this.sortOrder &&
          other.updatedAt == this.updatedAt);
}

class CategoriesCompanion extends UpdateCompanion<CategoryRow> {
  final Value<String> id;
  final Value<String> name;
  final Value<String> groupId;
  final Value<String?> parentId;
  final Value<int?> color;
  final Value<String?> icon;
  final Value<bool> hidden;
  final Value<int> sortOrder;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const CategoriesCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.groupId = const Value.absent(),
    this.parentId = const Value.absent(),
    this.color = const Value.absent(),
    this.icon = const Value.absent(),
    this.hidden = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CategoriesCompanion.insert({
    required String id,
    required String name,
    required String groupId,
    this.parentId = const Value.absent(),
    this.color = const Value.absent(),
    this.icon = const Value.absent(),
    this.hidden = const Value.absent(),
    this.sortOrder = const Value.absent(),
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       groupId = Value(groupId),
       updatedAt = Value(updatedAt);
  static Insertable<CategoryRow> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<String>? groupId,
    Expression<String>? parentId,
    Expression<int>? color,
    Expression<String>? icon,
    Expression<bool>? hidden,
    Expression<int>? sortOrder,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (groupId != null) 'group_id': groupId,
      if (parentId != null) 'parent_id': parentId,
      if (color != null) 'color': color,
      if (icon != null) 'icon': icon,
      if (hidden != null) 'hidden': hidden,
      if (sortOrder != null) 'sort_order': sortOrder,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CategoriesCompanion copyWith({
    Value<String>? id,
    Value<String>? name,
    Value<String>? groupId,
    Value<String?>? parentId,
    Value<int?>? color,
    Value<String?>? icon,
    Value<bool>? hidden,
    Value<int>? sortOrder,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return CategoriesCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      groupId: groupId ?? this.groupId,
      parentId: parentId ?? this.parentId,
      color: color ?? this.color,
      icon: icon ?? this.icon,
      hidden: hidden ?? this.hidden,
      sortOrder: sortOrder ?? this.sortOrder,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (groupId.present) {
      map['group_id'] = Variable<String>(groupId.value);
    }
    if (parentId.present) {
      map['parent_id'] = Variable<String>(parentId.value);
    }
    if (color.present) {
      map['color'] = Variable<int>(color.value);
    }
    if (icon.present) {
      map['icon'] = Variable<String>(icon.value);
    }
    if (hidden.present) {
      map['hidden'] = Variable<bool>(hidden.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<int>(sortOrder.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CategoriesCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('groupId: $groupId, ')
          ..write('parentId: $parentId, ')
          ..write('color: $color, ')
          ..write('icon: $icon, ')
          ..write('hidden: $hidden, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $PayeesTable extends Payees with TableInfo<$PayeesTable, PayeeRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PayeesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _useCountMeta = const VerificationMeta(
    'useCount',
  );
  @override
  late final GeneratedColumn<int> useCount = GeneratedColumn<int>(
    'use_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _learnCategoriesMeta = const VerificationMeta(
    'learnCategories',
  );
  @override
  late final GeneratedColumn<bool> learnCategories = GeneratedColumn<bool>(
    'learn_categories',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("learn_categories" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    name,
    useCount,
    learnCategories,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'payees';
  @override
  VerificationContext validateIntegrity(
    Insertable<PayeeRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('use_count')) {
      context.handle(
        _useCountMeta,
        useCount.isAcceptableOrUnknown(data['use_count']!, _useCountMeta),
      );
    }
    if (data.containsKey('learn_categories')) {
      context.handle(
        _learnCategoriesMeta,
        learnCategories.isAcceptableOrUnknown(
          data['learn_categories']!,
          _learnCategoriesMeta,
        ),
      );
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  PayeeRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PayeeRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      useCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}use_count'],
      )!,
      learnCategories: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}learn_categories'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $PayeesTable createAlias(String alias) {
    return $PayeesTable(attachedDatabase, alias);
  }
}

class PayeeRow extends DataClass implements Insertable<PayeeRow> {
  final String id;
  final String name;
  final int useCount;
  final bool learnCategories;
  final int updatedAt;
  const PayeeRow({
    required this.id,
    required this.name,
    required this.useCount,
    required this.learnCategories,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    map['use_count'] = Variable<int>(useCount);
    map['learn_categories'] = Variable<bool>(learnCategories);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  PayeesCompanion toCompanion(bool nullToAbsent) {
    return PayeesCompanion(
      id: Value(id),
      name: Value(name),
      useCount: Value(useCount),
      learnCategories: Value(learnCategories),
      updatedAt: Value(updatedAt),
    );
  }

  factory PayeeRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PayeeRow(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      useCount: serializer.fromJson<int>(json['useCount']),
      learnCategories: serializer.fromJson<bool>(json['learnCategories']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'useCount': serializer.toJson<int>(useCount),
      'learnCategories': serializer.toJson<bool>(learnCategories),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  PayeeRow copyWith({
    String? id,
    String? name,
    int? useCount,
    bool? learnCategories,
    int? updatedAt,
  }) => PayeeRow(
    id: id ?? this.id,
    name: name ?? this.name,
    useCount: useCount ?? this.useCount,
    learnCategories: learnCategories ?? this.learnCategories,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  PayeeRow copyWithCompanion(PayeesCompanion data) {
    return PayeeRow(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      useCount: data.useCount.present ? data.useCount.value : this.useCount,
      learnCategories: data.learnCategories.present
          ? data.learnCategories.value
          : this.learnCategories,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PayeeRow(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('useCount: $useCount, ')
          ..write('learnCategories: $learnCategories, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, name, useCount, learnCategories, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PayeeRow &&
          other.id == this.id &&
          other.name == this.name &&
          other.useCount == this.useCount &&
          other.learnCategories == this.learnCategories &&
          other.updatedAt == this.updatedAt);
}

class PayeesCompanion extends UpdateCompanion<PayeeRow> {
  final Value<String> id;
  final Value<String> name;
  final Value<int> useCount;
  final Value<bool> learnCategories;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const PayeesCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.useCount = const Value.absent(),
    this.learnCategories = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PayeesCompanion.insert({
    required String id,
    required String name,
    this.useCount = const Value.absent(),
    this.learnCategories = const Value.absent(),
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       updatedAt = Value(updatedAt);
  static Insertable<PayeeRow> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<int>? useCount,
    Expression<bool>? learnCategories,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (useCount != null) 'use_count': useCount,
      if (learnCategories != null) 'learn_categories': learnCategories,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PayeesCompanion copyWith({
    Value<String>? id,
    Value<String>? name,
    Value<int>? useCount,
    Value<bool>? learnCategories,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return PayeesCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      useCount: useCount ?? this.useCount,
      learnCategories: learnCategories ?? this.learnCategories,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (useCount.present) {
      map['use_count'] = Variable<int>(useCount.value);
    }
    if (learnCategories.present) {
      map['learn_categories'] = Variable<bool>(learnCategories.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PayeesCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('useCount: $useCount, ')
          ..write('learnCategories: $learnCategories, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $TransactionsTable extends Transactions
    with TableInfo<$TransactionsTable, TransactionRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $TransactionsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _accountIdMeta = const VerificationMeta(
    'accountId',
  );
  @override
  late final GeneratedColumn<String> accountId = GeneratedColumn<String>(
    'account_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _categoryIdMeta = const VerificationMeta(
    'categoryId',
  );
  @override
  late final GeneratedColumn<String> categoryId = GeneratedColumn<String>(
    'category_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _payeeIdMeta = const VerificationMeta(
    'payeeId',
  );
  @override
  late final GeneratedColumn<String> payeeId = GeneratedColumn<String>(
    'payee_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _payeeNameMeta = const VerificationMeta(
    'payeeName',
  );
  @override
  late final GeneratedColumn<String> payeeName = GeneratedColumn<String>(
    'payee_name',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _amountCentsMeta = const VerificationMeta(
    'amountCents',
  );
  @override
  late final GeneratedColumn<int> amountCents = GeneratedColumn<int>(
    'amount_cents',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _dateMeta = const VerificationMeta('date');
  @override
  late final GeneratedColumn<String> date = GeneratedColumn<String>(
    'date',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _notesMeta = const VerificationMeta('notes');
  @override
  late final GeneratedColumn<String> notes = GeneratedColumn<String>(
    'notes',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _latitudeMeta = const VerificationMeta(
    'latitude',
  );
  @override
  late final GeneratedColumn<double> latitude = GeneratedColumn<double>(
    'latitude',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _longitudeMeta = const VerificationMeta(
    'longitude',
  );
  @override
  late final GeneratedColumn<double> longitude = GeneratedColumn<double>(
    'longitude',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _locationNameMeta = const VerificationMeta(
    'locationName',
  );
  @override
  late final GeneratedColumn<String> locationName = GeneratedColumn<String>(
    'location_name',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _clearedMeta = const VerificationMeta(
    'cleared',
  );
  @override
  late final GeneratedColumn<bool> cleared = GeneratedColumn<bool>(
    'cleared',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("cleared" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _reconciledMeta = const VerificationMeta(
    'reconciled',
  );
  @override
  late final GeneratedColumn<bool> reconciled = GeneratedColumn<bool>(
    'reconciled',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("reconciled" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _originMeta = const VerificationMeta('origin');
  @override
  late final GeneratedColumn<String> origin = GeneratedColumn<String>(
    'origin',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('manual'),
  );
  static const VerificationMeta _originRefMeta = const VerificationMeta(
    'originRef',
  );
  @override
  late final GeneratedColumn<String> originRef = GeneratedColumn<String>(
    'origin_ref',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _importedIdMeta = const VerificationMeta(
    'importedId',
  );
  @override
  late final GeneratedColumn<String> importedId = GeneratedColumn<String>(
    'imported_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _transferAccountIdMeta = const VerificationMeta(
    'transferAccountId',
  );
  @override
  late final GeneratedColumn<String> transferAccountId =
      GeneratedColumn<String>(
        'transfer_account_id',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _transferGroupIdMeta = const VerificationMeta(
    'transferGroupId',
  );
  @override
  late final GeneratedColumn<String> transferGroupId = GeneratedColumn<String>(
    'transfer_group_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _parentIdMeta = const VerificationMeta(
    'parentId',
  );
  @override
  late final GeneratedColumn<String> parentId = GeneratedColumn<String>(
    'parent_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _splitTotalCentsMeta = const VerificationMeta(
    'splitTotalCents',
  );
  @override
  late final GeneratedColumn<int> splitTotalCents = GeneratedColumn<int>(
    'split_total_cents',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _groupParentIdMeta = const VerificationMeta(
    'groupParentId',
  );
  @override
  late final GeneratedColumn<String> groupParentId = GeneratedColumn<String>(
    'group_parent_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _isGroupParentMeta = const VerificationMeta(
    'isGroupParent',
  );
  @override
  late final GeneratedColumn<bool> isGroupParent = GeneratedColumn<bool>(
    'is_group_parent',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_group_parent" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _originalAmountCentsMeta =
      const VerificationMeta('originalAmountCents');
  @override
  late final GeneratedColumn<int> originalAmountCents = GeneratedColumn<int>(
    'original_amount_cents',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _originalCurrencyMeta = const VerificationMeta(
    'originalCurrency',
  );
  @override
  late final GeneratedColumn<String> originalCurrency = GeneratedColumn<String>(
    'original_currency',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    accountId,
    categoryId,
    payeeId,
    payeeName,
    amountCents,
    date,
    notes,
    latitude,
    longitude,
    locationName,
    cleared,
    reconciled,
    origin,
    originRef,
    importedId,
    transferAccountId,
    transferGroupId,
    parentId,
    splitTotalCents,
    groupParentId,
    isGroupParent,
    originalAmountCents,
    originalCurrency,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'transactions';
  @override
  VerificationContext validateIntegrity(
    Insertable<TransactionRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('account_id')) {
      context.handle(
        _accountIdMeta,
        accountId.isAcceptableOrUnknown(data['account_id']!, _accountIdMeta),
      );
    } else if (isInserting) {
      context.missing(_accountIdMeta);
    }
    if (data.containsKey('category_id')) {
      context.handle(
        _categoryIdMeta,
        categoryId.isAcceptableOrUnknown(data['category_id']!, _categoryIdMeta),
      );
    }
    if (data.containsKey('payee_id')) {
      context.handle(
        _payeeIdMeta,
        payeeId.isAcceptableOrUnknown(data['payee_id']!, _payeeIdMeta),
      );
    }
    if (data.containsKey('payee_name')) {
      context.handle(
        _payeeNameMeta,
        payeeName.isAcceptableOrUnknown(data['payee_name']!, _payeeNameMeta),
      );
    }
    if (data.containsKey('amount_cents')) {
      context.handle(
        _amountCentsMeta,
        amountCents.isAcceptableOrUnknown(
          data['amount_cents']!,
          _amountCentsMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_amountCentsMeta);
    }
    if (data.containsKey('date')) {
      context.handle(
        _dateMeta,
        date.isAcceptableOrUnknown(data['date']!, _dateMeta),
      );
    } else if (isInserting) {
      context.missing(_dateMeta);
    }
    if (data.containsKey('notes')) {
      context.handle(
        _notesMeta,
        notes.isAcceptableOrUnknown(data['notes']!, _notesMeta),
      );
    }
    if (data.containsKey('latitude')) {
      context.handle(
        _latitudeMeta,
        latitude.isAcceptableOrUnknown(data['latitude']!, _latitudeMeta),
      );
    }
    if (data.containsKey('longitude')) {
      context.handle(
        _longitudeMeta,
        longitude.isAcceptableOrUnknown(data['longitude']!, _longitudeMeta),
      );
    }
    if (data.containsKey('location_name')) {
      context.handle(
        _locationNameMeta,
        locationName.isAcceptableOrUnknown(
          data['location_name']!,
          _locationNameMeta,
        ),
      );
    }
    if (data.containsKey('cleared')) {
      context.handle(
        _clearedMeta,
        cleared.isAcceptableOrUnknown(data['cleared']!, _clearedMeta),
      );
    }
    if (data.containsKey('reconciled')) {
      context.handle(
        _reconciledMeta,
        reconciled.isAcceptableOrUnknown(data['reconciled']!, _reconciledMeta),
      );
    }
    if (data.containsKey('origin')) {
      context.handle(
        _originMeta,
        origin.isAcceptableOrUnknown(data['origin']!, _originMeta),
      );
    }
    if (data.containsKey('origin_ref')) {
      context.handle(
        _originRefMeta,
        originRef.isAcceptableOrUnknown(data['origin_ref']!, _originRefMeta),
      );
    }
    if (data.containsKey('imported_id')) {
      context.handle(
        _importedIdMeta,
        importedId.isAcceptableOrUnknown(data['imported_id']!, _importedIdMeta),
      );
    }
    if (data.containsKey('transfer_account_id')) {
      context.handle(
        _transferAccountIdMeta,
        transferAccountId.isAcceptableOrUnknown(
          data['transfer_account_id']!,
          _transferAccountIdMeta,
        ),
      );
    }
    if (data.containsKey('transfer_group_id')) {
      context.handle(
        _transferGroupIdMeta,
        transferGroupId.isAcceptableOrUnknown(
          data['transfer_group_id']!,
          _transferGroupIdMeta,
        ),
      );
    }
    if (data.containsKey('parent_id')) {
      context.handle(
        _parentIdMeta,
        parentId.isAcceptableOrUnknown(data['parent_id']!, _parentIdMeta),
      );
    }
    if (data.containsKey('split_total_cents')) {
      context.handle(
        _splitTotalCentsMeta,
        splitTotalCents.isAcceptableOrUnknown(
          data['split_total_cents']!,
          _splitTotalCentsMeta,
        ),
      );
    }
    if (data.containsKey('group_parent_id')) {
      context.handle(
        _groupParentIdMeta,
        groupParentId.isAcceptableOrUnknown(
          data['group_parent_id']!,
          _groupParentIdMeta,
        ),
      );
    }
    if (data.containsKey('is_group_parent')) {
      context.handle(
        _isGroupParentMeta,
        isGroupParent.isAcceptableOrUnknown(
          data['is_group_parent']!,
          _isGroupParentMeta,
        ),
      );
    }
    if (data.containsKey('original_amount_cents')) {
      context.handle(
        _originalAmountCentsMeta,
        originalAmountCents.isAcceptableOrUnknown(
          data['original_amount_cents']!,
          _originalAmountCentsMeta,
        ),
      );
    }
    if (data.containsKey('original_currency')) {
      context.handle(
        _originalCurrencyMeta,
        originalCurrency.isAcceptableOrUnknown(
          data['original_currency']!,
          _originalCurrencyMeta,
        ),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  TransactionRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return TransactionRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      accountId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}account_id'],
      )!,
      categoryId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}category_id'],
      ),
      payeeId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payee_id'],
      ),
      payeeName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payee_name'],
      ),
      amountCents: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}amount_cents'],
      )!,
      date: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}date'],
      )!,
      notes: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}notes'],
      ),
      latitude: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}latitude'],
      ),
      longitude: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}longitude'],
      ),
      locationName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}location_name'],
      ),
      cleared: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}cleared'],
      )!,
      reconciled: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}reconciled'],
      )!,
      origin: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}origin'],
      )!,
      originRef: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}origin_ref'],
      ),
      importedId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}imported_id'],
      ),
      transferAccountId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}transfer_account_id'],
      ),
      transferGroupId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}transfer_group_id'],
      ),
      parentId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}parent_id'],
      ),
      splitTotalCents: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}split_total_cents'],
      ),
      groupParentId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}group_parent_id'],
      ),
      isGroupParent: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_group_parent'],
      )!,
      originalAmountCents: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}original_amount_cents'],
      ),
      originalCurrency: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}original_currency'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $TransactionsTable createAlias(String alias) {
    return $TransactionsTable(attachedDatabase, alias);
  }
}

class TransactionRow extends DataClass implements Insertable<TransactionRow> {
  final String id;
  final String accountId;
  final String? categoryId;
  final String? payeeId;
  final String? payeeName;
  final int amountCents;
  final String date;
  final String? notes;
  final double? latitude;
  final double? longitude;
  final String? locationName;
  final bool cleared;
  final bool reconciled;
  final String origin;
  final String? originRef;
  final String? importedId;
  final String? transferAccountId;
  final String? transferGroupId;
  final String? parentId;
  final int? splitTotalCents;
  final String? groupParentId;
  final bool isGroupParent;
  final int? originalAmountCents;
  final String? originalCurrency;
  final int createdAt;
  final int updatedAt;
  const TransactionRow({
    required this.id,
    required this.accountId,
    this.categoryId,
    this.payeeId,
    this.payeeName,
    required this.amountCents,
    required this.date,
    this.notes,
    this.latitude,
    this.longitude,
    this.locationName,
    required this.cleared,
    required this.reconciled,
    required this.origin,
    this.originRef,
    this.importedId,
    this.transferAccountId,
    this.transferGroupId,
    this.parentId,
    this.splitTotalCents,
    this.groupParentId,
    required this.isGroupParent,
    this.originalAmountCents,
    this.originalCurrency,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['account_id'] = Variable<String>(accountId);
    if (!nullToAbsent || categoryId != null) {
      map['category_id'] = Variable<String>(categoryId);
    }
    if (!nullToAbsent || payeeId != null) {
      map['payee_id'] = Variable<String>(payeeId);
    }
    if (!nullToAbsent || payeeName != null) {
      map['payee_name'] = Variable<String>(payeeName);
    }
    map['amount_cents'] = Variable<int>(amountCents);
    map['date'] = Variable<String>(date);
    if (!nullToAbsent || notes != null) {
      map['notes'] = Variable<String>(notes);
    }
    if (!nullToAbsent || latitude != null) {
      map['latitude'] = Variable<double>(latitude);
    }
    if (!nullToAbsent || longitude != null) {
      map['longitude'] = Variable<double>(longitude);
    }
    if (!nullToAbsent || locationName != null) {
      map['location_name'] = Variable<String>(locationName);
    }
    map['cleared'] = Variable<bool>(cleared);
    map['reconciled'] = Variable<bool>(reconciled);
    map['origin'] = Variable<String>(origin);
    if (!nullToAbsent || originRef != null) {
      map['origin_ref'] = Variable<String>(originRef);
    }
    if (!nullToAbsent || importedId != null) {
      map['imported_id'] = Variable<String>(importedId);
    }
    if (!nullToAbsent || transferAccountId != null) {
      map['transfer_account_id'] = Variable<String>(transferAccountId);
    }
    if (!nullToAbsent || transferGroupId != null) {
      map['transfer_group_id'] = Variable<String>(transferGroupId);
    }
    if (!nullToAbsent || parentId != null) {
      map['parent_id'] = Variable<String>(parentId);
    }
    if (!nullToAbsent || splitTotalCents != null) {
      map['split_total_cents'] = Variable<int>(splitTotalCents);
    }
    if (!nullToAbsent || groupParentId != null) {
      map['group_parent_id'] = Variable<String>(groupParentId);
    }
    map['is_group_parent'] = Variable<bool>(isGroupParent);
    if (!nullToAbsent || originalAmountCents != null) {
      map['original_amount_cents'] = Variable<int>(originalAmountCents);
    }
    if (!nullToAbsent || originalCurrency != null) {
      map['original_currency'] = Variable<String>(originalCurrency);
    }
    map['created_at'] = Variable<int>(createdAt);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  TransactionsCompanion toCompanion(bool nullToAbsent) {
    return TransactionsCompanion(
      id: Value(id),
      accountId: Value(accountId),
      categoryId: categoryId == null && nullToAbsent
          ? const Value.absent()
          : Value(categoryId),
      payeeId: payeeId == null && nullToAbsent
          ? const Value.absent()
          : Value(payeeId),
      payeeName: payeeName == null && nullToAbsent
          ? const Value.absent()
          : Value(payeeName),
      amountCents: Value(amountCents),
      date: Value(date),
      notes: notes == null && nullToAbsent
          ? const Value.absent()
          : Value(notes),
      latitude: latitude == null && nullToAbsent
          ? const Value.absent()
          : Value(latitude),
      longitude: longitude == null && nullToAbsent
          ? const Value.absent()
          : Value(longitude),
      locationName: locationName == null && nullToAbsent
          ? const Value.absent()
          : Value(locationName),
      cleared: Value(cleared),
      reconciled: Value(reconciled),
      origin: Value(origin),
      originRef: originRef == null && nullToAbsent
          ? const Value.absent()
          : Value(originRef),
      importedId: importedId == null && nullToAbsent
          ? const Value.absent()
          : Value(importedId),
      transferAccountId: transferAccountId == null && nullToAbsent
          ? const Value.absent()
          : Value(transferAccountId),
      transferGroupId: transferGroupId == null && nullToAbsent
          ? const Value.absent()
          : Value(transferGroupId),
      parentId: parentId == null && nullToAbsent
          ? const Value.absent()
          : Value(parentId),
      splitTotalCents: splitTotalCents == null && nullToAbsent
          ? const Value.absent()
          : Value(splitTotalCents),
      groupParentId: groupParentId == null && nullToAbsent
          ? const Value.absent()
          : Value(groupParentId),
      isGroupParent: Value(isGroupParent),
      originalAmountCents: originalAmountCents == null && nullToAbsent
          ? const Value.absent()
          : Value(originalAmountCents),
      originalCurrency: originalCurrency == null && nullToAbsent
          ? const Value.absent()
          : Value(originalCurrency),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory TransactionRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return TransactionRow(
      id: serializer.fromJson<String>(json['id']),
      accountId: serializer.fromJson<String>(json['accountId']),
      categoryId: serializer.fromJson<String?>(json['categoryId']),
      payeeId: serializer.fromJson<String?>(json['payeeId']),
      payeeName: serializer.fromJson<String?>(json['payeeName']),
      amountCents: serializer.fromJson<int>(json['amountCents']),
      date: serializer.fromJson<String>(json['date']),
      notes: serializer.fromJson<String?>(json['notes']),
      latitude: serializer.fromJson<double?>(json['latitude']),
      longitude: serializer.fromJson<double?>(json['longitude']),
      locationName: serializer.fromJson<String?>(json['locationName']),
      cleared: serializer.fromJson<bool>(json['cleared']),
      reconciled: serializer.fromJson<bool>(json['reconciled']),
      origin: serializer.fromJson<String>(json['origin']),
      originRef: serializer.fromJson<String?>(json['originRef']),
      importedId: serializer.fromJson<String?>(json['importedId']),
      transferAccountId: serializer.fromJson<String?>(
        json['transferAccountId'],
      ),
      transferGroupId: serializer.fromJson<String?>(json['transferGroupId']),
      parentId: serializer.fromJson<String?>(json['parentId']),
      splitTotalCents: serializer.fromJson<int?>(json['splitTotalCents']),
      groupParentId: serializer.fromJson<String?>(json['groupParentId']),
      isGroupParent: serializer.fromJson<bool>(json['isGroupParent']),
      originalAmountCents: serializer.fromJson<int?>(
        json['originalAmountCents'],
      ),
      originalCurrency: serializer.fromJson<String?>(json['originalCurrency']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'accountId': serializer.toJson<String>(accountId),
      'categoryId': serializer.toJson<String?>(categoryId),
      'payeeId': serializer.toJson<String?>(payeeId),
      'payeeName': serializer.toJson<String?>(payeeName),
      'amountCents': serializer.toJson<int>(amountCents),
      'date': serializer.toJson<String>(date),
      'notes': serializer.toJson<String?>(notes),
      'latitude': serializer.toJson<double?>(latitude),
      'longitude': serializer.toJson<double?>(longitude),
      'locationName': serializer.toJson<String?>(locationName),
      'cleared': serializer.toJson<bool>(cleared),
      'reconciled': serializer.toJson<bool>(reconciled),
      'origin': serializer.toJson<String>(origin),
      'originRef': serializer.toJson<String?>(originRef),
      'importedId': serializer.toJson<String?>(importedId),
      'transferAccountId': serializer.toJson<String?>(transferAccountId),
      'transferGroupId': serializer.toJson<String?>(transferGroupId),
      'parentId': serializer.toJson<String?>(parentId),
      'splitTotalCents': serializer.toJson<int?>(splitTotalCents),
      'groupParentId': serializer.toJson<String?>(groupParentId),
      'isGroupParent': serializer.toJson<bool>(isGroupParent),
      'originalAmountCents': serializer.toJson<int?>(originalAmountCents),
      'originalCurrency': serializer.toJson<String?>(originalCurrency),
      'createdAt': serializer.toJson<int>(createdAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  TransactionRow copyWith({
    String? id,
    String? accountId,
    Value<String?> categoryId = const Value.absent(),
    Value<String?> payeeId = const Value.absent(),
    Value<String?> payeeName = const Value.absent(),
    int? amountCents,
    String? date,
    Value<String?> notes = const Value.absent(),
    Value<double?> latitude = const Value.absent(),
    Value<double?> longitude = const Value.absent(),
    Value<String?> locationName = const Value.absent(),
    bool? cleared,
    bool? reconciled,
    String? origin,
    Value<String?> originRef = const Value.absent(),
    Value<String?> importedId = const Value.absent(),
    Value<String?> transferAccountId = const Value.absent(),
    Value<String?> transferGroupId = const Value.absent(),
    Value<String?> parentId = const Value.absent(),
    Value<int?> splitTotalCents = const Value.absent(),
    Value<String?> groupParentId = const Value.absent(),
    bool? isGroupParent,
    Value<int?> originalAmountCents = const Value.absent(),
    Value<String?> originalCurrency = const Value.absent(),
    int? createdAt,
    int? updatedAt,
  }) => TransactionRow(
    id: id ?? this.id,
    accountId: accountId ?? this.accountId,
    categoryId: categoryId.present ? categoryId.value : this.categoryId,
    payeeId: payeeId.present ? payeeId.value : this.payeeId,
    payeeName: payeeName.present ? payeeName.value : this.payeeName,
    amountCents: amountCents ?? this.amountCents,
    date: date ?? this.date,
    notes: notes.present ? notes.value : this.notes,
    latitude: latitude.present ? latitude.value : this.latitude,
    longitude: longitude.present ? longitude.value : this.longitude,
    locationName: locationName.present ? locationName.value : this.locationName,
    cleared: cleared ?? this.cleared,
    reconciled: reconciled ?? this.reconciled,
    origin: origin ?? this.origin,
    originRef: originRef.present ? originRef.value : this.originRef,
    importedId: importedId.present ? importedId.value : this.importedId,
    transferAccountId: transferAccountId.present
        ? transferAccountId.value
        : this.transferAccountId,
    transferGroupId: transferGroupId.present
        ? transferGroupId.value
        : this.transferGroupId,
    parentId: parentId.present ? parentId.value : this.parentId,
    splitTotalCents: splitTotalCents.present
        ? splitTotalCents.value
        : this.splitTotalCents,
    groupParentId: groupParentId.present
        ? groupParentId.value
        : this.groupParentId,
    isGroupParent: isGroupParent ?? this.isGroupParent,
    originalAmountCents: originalAmountCents.present
        ? originalAmountCents.value
        : this.originalAmountCents,
    originalCurrency: originalCurrency.present
        ? originalCurrency.value
        : this.originalCurrency,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  TransactionRow copyWithCompanion(TransactionsCompanion data) {
    return TransactionRow(
      id: data.id.present ? data.id.value : this.id,
      accountId: data.accountId.present ? data.accountId.value : this.accountId,
      categoryId: data.categoryId.present
          ? data.categoryId.value
          : this.categoryId,
      payeeId: data.payeeId.present ? data.payeeId.value : this.payeeId,
      payeeName: data.payeeName.present ? data.payeeName.value : this.payeeName,
      amountCents: data.amountCents.present
          ? data.amountCents.value
          : this.amountCents,
      date: data.date.present ? data.date.value : this.date,
      notes: data.notes.present ? data.notes.value : this.notes,
      latitude: data.latitude.present ? data.latitude.value : this.latitude,
      longitude: data.longitude.present ? data.longitude.value : this.longitude,
      locationName: data.locationName.present
          ? data.locationName.value
          : this.locationName,
      cleared: data.cleared.present ? data.cleared.value : this.cleared,
      reconciled: data.reconciled.present
          ? data.reconciled.value
          : this.reconciled,
      origin: data.origin.present ? data.origin.value : this.origin,
      originRef: data.originRef.present ? data.originRef.value : this.originRef,
      importedId: data.importedId.present
          ? data.importedId.value
          : this.importedId,
      transferAccountId: data.transferAccountId.present
          ? data.transferAccountId.value
          : this.transferAccountId,
      transferGroupId: data.transferGroupId.present
          ? data.transferGroupId.value
          : this.transferGroupId,
      parentId: data.parentId.present ? data.parentId.value : this.parentId,
      splitTotalCents: data.splitTotalCents.present
          ? data.splitTotalCents.value
          : this.splitTotalCents,
      groupParentId: data.groupParentId.present
          ? data.groupParentId.value
          : this.groupParentId,
      isGroupParent: data.isGroupParent.present
          ? data.isGroupParent.value
          : this.isGroupParent,
      originalAmountCents: data.originalAmountCents.present
          ? data.originalAmountCents.value
          : this.originalAmountCents,
      originalCurrency: data.originalCurrency.present
          ? data.originalCurrency.value
          : this.originalCurrency,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('TransactionRow(')
          ..write('id: $id, ')
          ..write('accountId: $accountId, ')
          ..write('categoryId: $categoryId, ')
          ..write('payeeId: $payeeId, ')
          ..write('payeeName: $payeeName, ')
          ..write('amountCents: $amountCents, ')
          ..write('date: $date, ')
          ..write('notes: $notes, ')
          ..write('latitude: $latitude, ')
          ..write('longitude: $longitude, ')
          ..write('locationName: $locationName, ')
          ..write('cleared: $cleared, ')
          ..write('reconciled: $reconciled, ')
          ..write('origin: $origin, ')
          ..write('originRef: $originRef, ')
          ..write('importedId: $importedId, ')
          ..write('transferAccountId: $transferAccountId, ')
          ..write('transferGroupId: $transferGroupId, ')
          ..write('parentId: $parentId, ')
          ..write('splitTotalCents: $splitTotalCents, ')
          ..write('groupParentId: $groupParentId, ')
          ..write('isGroupParent: $isGroupParent, ')
          ..write('originalAmountCents: $originalAmountCents, ')
          ..write('originalCurrency: $originalCurrency, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hashAll([
    id,
    accountId,
    categoryId,
    payeeId,
    payeeName,
    amountCents,
    date,
    notes,
    latitude,
    longitude,
    locationName,
    cleared,
    reconciled,
    origin,
    originRef,
    importedId,
    transferAccountId,
    transferGroupId,
    parentId,
    splitTotalCents,
    groupParentId,
    isGroupParent,
    originalAmountCents,
    originalCurrency,
    createdAt,
    updatedAt,
  ]);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is TransactionRow &&
          other.id == this.id &&
          other.accountId == this.accountId &&
          other.categoryId == this.categoryId &&
          other.payeeId == this.payeeId &&
          other.payeeName == this.payeeName &&
          other.amountCents == this.amountCents &&
          other.date == this.date &&
          other.notes == this.notes &&
          other.latitude == this.latitude &&
          other.longitude == this.longitude &&
          other.locationName == this.locationName &&
          other.cleared == this.cleared &&
          other.reconciled == this.reconciled &&
          other.origin == this.origin &&
          other.originRef == this.originRef &&
          other.importedId == this.importedId &&
          other.transferAccountId == this.transferAccountId &&
          other.transferGroupId == this.transferGroupId &&
          other.parentId == this.parentId &&
          other.splitTotalCents == this.splitTotalCents &&
          other.groupParentId == this.groupParentId &&
          other.isGroupParent == this.isGroupParent &&
          other.originalAmountCents == this.originalAmountCents &&
          other.originalCurrency == this.originalCurrency &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class TransactionsCompanion extends UpdateCompanion<TransactionRow> {
  final Value<String> id;
  final Value<String> accountId;
  final Value<String?> categoryId;
  final Value<String?> payeeId;
  final Value<String?> payeeName;
  final Value<int> amountCents;
  final Value<String> date;
  final Value<String?> notes;
  final Value<double?> latitude;
  final Value<double?> longitude;
  final Value<String?> locationName;
  final Value<bool> cleared;
  final Value<bool> reconciled;
  final Value<String> origin;
  final Value<String?> originRef;
  final Value<String?> importedId;
  final Value<String?> transferAccountId;
  final Value<String?> transferGroupId;
  final Value<String?> parentId;
  final Value<int?> splitTotalCents;
  final Value<String?> groupParentId;
  final Value<bool> isGroupParent;
  final Value<int?> originalAmountCents;
  final Value<String?> originalCurrency;
  final Value<int> createdAt;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const TransactionsCompanion({
    this.id = const Value.absent(),
    this.accountId = const Value.absent(),
    this.categoryId = const Value.absent(),
    this.payeeId = const Value.absent(),
    this.payeeName = const Value.absent(),
    this.amountCents = const Value.absent(),
    this.date = const Value.absent(),
    this.notes = const Value.absent(),
    this.latitude = const Value.absent(),
    this.longitude = const Value.absent(),
    this.locationName = const Value.absent(),
    this.cleared = const Value.absent(),
    this.reconciled = const Value.absent(),
    this.origin = const Value.absent(),
    this.originRef = const Value.absent(),
    this.importedId = const Value.absent(),
    this.transferAccountId = const Value.absent(),
    this.transferGroupId = const Value.absent(),
    this.parentId = const Value.absent(),
    this.splitTotalCents = const Value.absent(),
    this.groupParentId = const Value.absent(),
    this.isGroupParent = const Value.absent(),
    this.originalAmountCents = const Value.absent(),
    this.originalCurrency = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  TransactionsCompanion.insert({
    required String id,
    required String accountId,
    this.categoryId = const Value.absent(),
    this.payeeId = const Value.absent(),
    this.payeeName = const Value.absent(),
    required int amountCents,
    required String date,
    this.notes = const Value.absent(),
    this.latitude = const Value.absent(),
    this.longitude = const Value.absent(),
    this.locationName = const Value.absent(),
    this.cleared = const Value.absent(),
    this.reconciled = const Value.absent(),
    this.origin = const Value.absent(),
    this.originRef = const Value.absent(),
    this.importedId = const Value.absent(),
    this.transferAccountId = const Value.absent(),
    this.transferGroupId = const Value.absent(),
    this.parentId = const Value.absent(),
    this.splitTotalCents = const Value.absent(),
    this.groupParentId = const Value.absent(),
    this.isGroupParent = const Value.absent(),
    this.originalAmountCents = const Value.absent(),
    this.originalCurrency = const Value.absent(),
    required int createdAt,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       accountId = Value(accountId),
       amountCents = Value(amountCents),
       date = Value(date),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<TransactionRow> custom({
    Expression<String>? id,
    Expression<String>? accountId,
    Expression<String>? categoryId,
    Expression<String>? payeeId,
    Expression<String>? payeeName,
    Expression<int>? amountCents,
    Expression<String>? date,
    Expression<String>? notes,
    Expression<double>? latitude,
    Expression<double>? longitude,
    Expression<String>? locationName,
    Expression<bool>? cleared,
    Expression<bool>? reconciled,
    Expression<String>? origin,
    Expression<String>? originRef,
    Expression<String>? importedId,
    Expression<String>? transferAccountId,
    Expression<String>? transferGroupId,
    Expression<String>? parentId,
    Expression<int>? splitTotalCents,
    Expression<String>? groupParentId,
    Expression<bool>? isGroupParent,
    Expression<int>? originalAmountCents,
    Expression<String>? originalCurrency,
    Expression<int>? createdAt,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (accountId != null) 'account_id': accountId,
      if (categoryId != null) 'category_id': categoryId,
      if (payeeId != null) 'payee_id': payeeId,
      if (payeeName != null) 'payee_name': payeeName,
      if (amountCents != null) 'amount_cents': amountCents,
      if (date != null) 'date': date,
      if (notes != null) 'notes': notes,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
      if (locationName != null) 'location_name': locationName,
      if (cleared != null) 'cleared': cleared,
      if (reconciled != null) 'reconciled': reconciled,
      if (origin != null) 'origin': origin,
      if (originRef != null) 'origin_ref': originRef,
      if (importedId != null) 'imported_id': importedId,
      if (transferAccountId != null) 'transfer_account_id': transferAccountId,
      if (transferGroupId != null) 'transfer_group_id': transferGroupId,
      if (parentId != null) 'parent_id': parentId,
      if (splitTotalCents != null) 'split_total_cents': splitTotalCents,
      if (groupParentId != null) 'group_parent_id': groupParentId,
      if (isGroupParent != null) 'is_group_parent': isGroupParent,
      if (originalAmountCents != null)
        'original_amount_cents': originalAmountCents,
      if (originalCurrency != null) 'original_currency': originalCurrency,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  TransactionsCompanion copyWith({
    Value<String>? id,
    Value<String>? accountId,
    Value<String?>? categoryId,
    Value<String?>? payeeId,
    Value<String?>? payeeName,
    Value<int>? amountCents,
    Value<String>? date,
    Value<String?>? notes,
    Value<double?>? latitude,
    Value<double?>? longitude,
    Value<String?>? locationName,
    Value<bool>? cleared,
    Value<bool>? reconciled,
    Value<String>? origin,
    Value<String?>? originRef,
    Value<String?>? importedId,
    Value<String?>? transferAccountId,
    Value<String?>? transferGroupId,
    Value<String?>? parentId,
    Value<int?>? splitTotalCents,
    Value<String?>? groupParentId,
    Value<bool>? isGroupParent,
    Value<int?>? originalAmountCents,
    Value<String?>? originalCurrency,
    Value<int>? createdAt,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return TransactionsCompanion(
      id: id ?? this.id,
      accountId: accountId ?? this.accountId,
      categoryId: categoryId ?? this.categoryId,
      payeeId: payeeId ?? this.payeeId,
      payeeName: payeeName ?? this.payeeName,
      amountCents: amountCents ?? this.amountCents,
      date: date ?? this.date,
      notes: notes ?? this.notes,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      locationName: locationName ?? this.locationName,
      cleared: cleared ?? this.cleared,
      reconciled: reconciled ?? this.reconciled,
      origin: origin ?? this.origin,
      originRef: originRef ?? this.originRef,
      importedId: importedId ?? this.importedId,
      transferAccountId: transferAccountId ?? this.transferAccountId,
      transferGroupId: transferGroupId ?? this.transferGroupId,
      parentId: parentId ?? this.parentId,
      splitTotalCents: splitTotalCents ?? this.splitTotalCents,
      groupParentId: groupParentId ?? this.groupParentId,
      isGroupParent: isGroupParent ?? this.isGroupParent,
      originalAmountCents: originalAmountCents ?? this.originalAmountCents,
      originalCurrency: originalCurrency ?? this.originalCurrency,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (accountId.present) {
      map['account_id'] = Variable<String>(accountId.value);
    }
    if (categoryId.present) {
      map['category_id'] = Variable<String>(categoryId.value);
    }
    if (payeeId.present) {
      map['payee_id'] = Variable<String>(payeeId.value);
    }
    if (payeeName.present) {
      map['payee_name'] = Variable<String>(payeeName.value);
    }
    if (amountCents.present) {
      map['amount_cents'] = Variable<int>(amountCents.value);
    }
    if (date.present) {
      map['date'] = Variable<String>(date.value);
    }
    if (notes.present) {
      map['notes'] = Variable<String>(notes.value);
    }
    if (latitude.present) {
      map['latitude'] = Variable<double>(latitude.value);
    }
    if (longitude.present) {
      map['longitude'] = Variable<double>(longitude.value);
    }
    if (locationName.present) {
      map['location_name'] = Variable<String>(locationName.value);
    }
    if (cleared.present) {
      map['cleared'] = Variable<bool>(cleared.value);
    }
    if (reconciled.present) {
      map['reconciled'] = Variable<bool>(reconciled.value);
    }
    if (origin.present) {
      map['origin'] = Variable<String>(origin.value);
    }
    if (originRef.present) {
      map['origin_ref'] = Variable<String>(originRef.value);
    }
    if (importedId.present) {
      map['imported_id'] = Variable<String>(importedId.value);
    }
    if (transferAccountId.present) {
      map['transfer_account_id'] = Variable<String>(transferAccountId.value);
    }
    if (transferGroupId.present) {
      map['transfer_group_id'] = Variable<String>(transferGroupId.value);
    }
    if (parentId.present) {
      map['parent_id'] = Variable<String>(parentId.value);
    }
    if (splitTotalCents.present) {
      map['split_total_cents'] = Variable<int>(splitTotalCents.value);
    }
    if (groupParentId.present) {
      map['group_parent_id'] = Variable<String>(groupParentId.value);
    }
    if (isGroupParent.present) {
      map['is_group_parent'] = Variable<bool>(isGroupParent.value);
    }
    if (originalAmountCents.present) {
      map['original_amount_cents'] = Variable<int>(originalAmountCents.value);
    }
    if (originalCurrency.present) {
      map['original_currency'] = Variable<String>(originalCurrency.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('TransactionsCompanion(')
          ..write('id: $id, ')
          ..write('accountId: $accountId, ')
          ..write('categoryId: $categoryId, ')
          ..write('payeeId: $payeeId, ')
          ..write('payeeName: $payeeName, ')
          ..write('amountCents: $amountCents, ')
          ..write('date: $date, ')
          ..write('notes: $notes, ')
          ..write('latitude: $latitude, ')
          ..write('longitude: $longitude, ')
          ..write('locationName: $locationName, ')
          ..write('cleared: $cleared, ')
          ..write('reconciled: $reconciled, ')
          ..write('origin: $origin, ')
          ..write('originRef: $originRef, ')
          ..write('importedId: $importedId, ')
          ..write('transferAccountId: $transferAccountId, ')
          ..write('transferGroupId: $transferGroupId, ')
          ..write('parentId: $parentId, ')
          ..write('splitTotalCents: $splitTotalCents, ')
          ..write('groupParentId: $groupParentId, ')
          ..write('isGroupParent: $isGroupParent, ')
          ..write('originalAmountCents: $originalAmountCents, ')
          ..write('originalCurrency: $originalCurrency, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $TagsTable extends Tags with TableInfo<$TagsTable, TagRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $TagsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _colorMeta = const VerificationMeta('color');
  @override
  late final GeneratedColumn<int> color = GeneratedColumn<int>(
    'color',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _archivedMeta = const VerificationMeta(
    'archived',
  );
  @override
  late final GeneratedColumn<bool> archived = GeneratedColumn<bool>(
    'archived',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("archived" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    name,
    color,
    archived,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'tags';
  @override
  VerificationContext validateIntegrity(
    Insertable<TagRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('color')) {
      context.handle(
        _colorMeta,
        color.isAcceptableOrUnknown(data['color']!, _colorMeta),
      );
    }
    if (data.containsKey('archived')) {
      context.handle(
        _archivedMeta,
        archived.isAcceptableOrUnknown(data['archived']!, _archivedMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  TagRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return TagRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      color: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}color'],
      ),
      archived: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}archived'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $TagsTable createAlias(String alias) {
    return $TagsTable(attachedDatabase, alias);
  }
}

class TagRow extends DataClass implements Insertable<TagRow> {
  final String id;
  final String name;
  final int? color;
  final bool archived;
  final int createdAt;
  final int updatedAt;
  const TagRow({
    required this.id,
    required this.name,
    this.color,
    required this.archived,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    if (!nullToAbsent || color != null) {
      map['color'] = Variable<int>(color);
    }
    map['archived'] = Variable<bool>(archived);
    map['created_at'] = Variable<int>(createdAt);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  TagsCompanion toCompanion(bool nullToAbsent) {
    return TagsCompanion(
      id: Value(id),
      name: Value(name),
      color: color == null && nullToAbsent
          ? const Value.absent()
          : Value(color),
      archived: Value(archived),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory TagRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return TagRow(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      color: serializer.fromJson<int?>(json['color']),
      archived: serializer.fromJson<bool>(json['archived']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'color': serializer.toJson<int?>(color),
      'archived': serializer.toJson<bool>(archived),
      'createdAt': serializer.toJson<int>(createdAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  TagRow copyWith({
    String? id,
    String? name,
    Value<int?> color = const Value.absent(),
    bool? archived,
    int? createdAt,
    int? updatedAt,
  }) => TagRow(
    id: id ?? this.id,
    name: name ?? this.name,
    color: color.present ? color.value : this.color,
    archived: archived ?? this.archived,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  TagRow copyWithCompanion(TagsCompanion data) {
    return TagRow(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      color: data.color.present ? data.color.value : this.color,
      archived: data.archived.present ? data.archived.value : this.archived,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('TagRow(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('color: $color, ')
          ..write('archived: $archived, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, name, color, archived, createdAt, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is TagRow &&
          other.id == this.id &&
          other.name == this.name &&
          other.color == this.color &&
          other.archived == this.archived &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class TagsCompanion extends UpdateCompanion<TagRow> {
  final Value<String> id;
  final Value<String> name;
  final Value<int?> color;
  final Value<bool> archived;
  final Value<int> createdAt;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const TagsCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.color = const Value.absent(),
    this.archived = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  TagsCompanion.insert({
    required String id,
    required String name,
    this.color = const Value.absent(),
    this.archived = const Value.absent(),
    required int createdAt,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<TagRow> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<int>? color,
    Expression<bool>? archived,
    Expression<int>? createdAt,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (color != null) 'color': color,
      if (archived != null) 'archived': archived,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  TagsCompanion copyWith({
    Value<String>? id,
    Value<String>? name,
    Value<int?>? color,
    Value<bool>? archived,
    Value<int>? createdAt,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return TagsCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      color: color ?? this.color,
      archived: archived ?? this.archived,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (color.present) {
      map['color'] = Variable<int>(color.value);
    }
    if (archived.present) {
      map['archived'] = Variable<bool>(archived.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('TagsCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('color: $color, ')
          ..write('archived: $archived, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $TransactionTagsTable extends TransactionTags
    with TableInfo<$TransactionTagsTable, TransactionTagRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $TransactionTagsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _transactionIdMeta = const VerificationMeta(
    'transactionId',
  );
  @override
  late final GeneratedColumn<String> transactionId = GeneratedColumn<String>(
    'transaction_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tagIdMeta = const VerificationMeta('tagId');
  @override
  late final GeneratedColumn<String> tagId = GeneratedColumn<String>(
    'tag_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [id, transactionId, tagId, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'transaction_tags';
  @override
  VerificationContext validateIntegrity(
    Insertable<TransactionTagRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('transaction_id')) {
      context.handle(
        _transactionIdMeta,
        transactionId.isAcceptableOrUnknown(
          data['transaction_id']!,
          _transactionIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_transactionIdMeta);
    }
    if (data.containsKey('tag_id')) {
      context.handle(
        _tagIdMeta,
        tagId.isAcceptableOrUnknown(data['tag_id']!, _tagIdMeta),
      );
    } else if (isInserting) {
      context.missing(_tagIdMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  TransactionTagRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return TransactionTagRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      transactionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}transaction_id'],
      )!,
      tagId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}tag_id'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $TransactionTagsTable createAlias(String alias) {
    return $TransactionTagsTable(attachedDatabase, alias);
  }
}

class TransactionTagRow extends DataClass
    implements Insertable<TransactionTagRow> {
  final String id;
  final String transactionId;
  final String tagId;
  final int updatedAt;
  const TransactionTagRow({
    required this.id,
    required this.transactionId,
    required this.tagId,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['transaction_id'] = Variable<String>(transactionId);
    map['tag_id'] = Variable<String>(tagId);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  TransactionTagsCompanion toCompanion(bool nullToAbsent) {
    return TransactionTagsCompanion(
      id: Value(id),
      transactionId: Value(transactionId),
      tagId: Value(tagId),
      updatedAt: Value(updatedAt),
    );
  }

  factory TransactionTagRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return TransactionTagRow(
      id: serializer.fromJson<String>(json['id']),
      transactionId: serializer.fromJson<String>(json['transactionId']),
      tagId: serializer.fromJson<String>(json['tagId']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'transactionId': serializer.toJson<String>(transactionId),
      'tagId': serializer.toJson<String>(tagId),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  TransactionTagRow copyWith({
    String? id,
    String? transactionId,
    String? tagId,
    int? updatedAt,
  }) => TransactionTagRow(
    id: id ?? this.id,
    transactionId: transactionId ?? this.transactionId,
    tagId: tagId ?? this.tagId,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  TransactionTagRow copyWithCompanion(TransactionTagsCompanion data) {
    return TransactionTagRow(
      id: data.id.present ? data.id.value : this.id,
      transactionId: data.transactionId.present
          ? data.transactionId.value
          : this.transactionId,
      tagId: data.tagId.present ? data.tagId.value : this.tagId,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('TransactionTagRow(')
          ..write('id: $id, ')
          ..write('transactionId: $transactionId, ')
          ..write('tagId: $tagId, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, transactionId, tagId, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is TransactionTagRow &&
          other.id == this.id &&
          other.transactionId == this.transactionId &&
          other.tagId == this.tagId &&
          other.updatedAt == this.updatedAt);
}

class TransactionTagsCompanion extends UpdateCompanion<TransactionTagRow> {
  final Value<String> id;
  final Value<String> transactionId;
  final Value<String> tagId;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const TransactionTagsCompanion({
    this.id = const Value.absent(),
    this.transactionId = const Value.absent(),
    this.tagId = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  TransactionTagsCompanion.insert({
    required String id,
    required String transactionId,
    required String tagId,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       transactionId = Value(transactionId),
       tagId = Value(tagId),
       updatedAt = Value(updatedAt);
  static Insertable<TransactionTagRow> custom({
    Expression<String>? id,
    Expression<String>? transactionId,
    Expression<String>? tagId,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (transactionId != null) 'transaction_id': transactionId,
      if (tagId != null) 'tag_id': tagId,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  TransactionTagsCompanion copyWith({
    Value<String>? id,
    Value<String>? transactionId,
    Value<String>? tagId,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return TransactionTagsCompanion(
      id: id ?? this.id,
      transactionId: transactionId ?? this.transactionId,
      tagId: tagId ?? this.tagId,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (transactionId.present) {
      map['transaction_id'] = Variable<String>(transactionId.value);
    }
    if (tagId.present) {
      map['tag_id'] = Variable<String>(tagId.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('TransactionTagsCompanion(')
          ..write('id: $id, ')
          ..write('transactionId: $transactionId, ')
          ..write('tagId: $tagId, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $RulesTable extends Rules with TableInfo<$RulesTable, RuleRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $RulesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _enabledMeta = const VerificationMeta(
    'enabled',
  );
  @override
  late final GeneratedColumn<bool> enabled = GeneratedColumn<bool>(
    'enabled',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("enabled" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  static const VerificationMeta _priorityMeta = const VerificationMeta(
    'priority',
  );
  @override
  late final GeneratedColumn<int> priority = GeneratedColumn<int>(
    'priority',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(100),
  );
  static const VerificationMeta _triggerTypeMeta = const VerificationMeta(
    'triggerType',
  );
  @override
  late final GeneratedColumn<String> triggerType = GeneratedColumn<String>(
    'trigger_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _triggerPayloadMeta = const VerificationMeta(
    'triggerPayload',
  );
  @override
  late final GeneratedColumn<String> triggerPayload = GeneratedColumn<String>(
    'trigger_payload',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _actionPayloadMeta = const VerificationMeta(
    'actionPayload',
  );
  @override
  late final GeneratedColumn<String> actionPayload = GeneratedColumn<String>(
    'action_payload',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    name,
    enabled,
    priority,
    triggerType,
    triggerPayload,
    actionPayload,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'rules';
  @override
  VerificationContext validateIntegrity(
    Insertable<RuleRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('enabled')) {
      context.handle(
        _enabledMeta,
        enabled.isAcceptableOrUnknown(data['enabled']!, _enabledMeta),
      );
    }
    if (data.containsKey('priority')) {
      context.handle(
        _priorityMeta,
        priority.isAcceptableOrUnknown(data['priority']!, _priorityMeta),
      );
    }
    if (data.containsKey('trigger_type')) {
      context.handle(
        _triggerTypeMeta,
        triggerType.isAcceptableOrUnknown(
          data['trigger_type']!,
          _triggerTypeMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_triggerTypeMeta);
    }
    if (data.containsKey('trigger_payload')) {
      context.handle(
        _triggerPayloadMeta,
        triggerPayload.isAcceptableOrUnknown(
          data['trigger_payload']!,
          _triggerPayloadMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_triggerPayloadMeta);
    }
    if (data.containsKey('action_payload')) {
      context.handle(
        _actionPayloadMeta,
        actionPayload.isAcceptableOrUnknown(
          data['action_payload']!,
          _actionPayloadMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_actionPayloadMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  RuleRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return RuleRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      enabled: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}enabled'],
      )!,
      priority: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}priority'],
      )!,
      triggerType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}trigger_type'],
      )!,
      triggerPayload: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}trigger_payload'],
      )!,
      actionPayload: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}action_payload'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $RulesTable createAlias(String alias) {
    return $RulesTable(attachedDatabase, alias);
  }
}

class RuleRow extends DataClass implements Insertable<RuleRow> {
  final String id;
  final String name;
  final bool enabled;
  final int priority;
  final String triggerType;
  final String triggerPayload;
  final String actionPayload;
  final int createdAt;
  final int updatedAt;
  const RuleRow({
    required this.id,
    required this.name,
    required this.enabled,
    required this.priority,
    required this.triggerType,
    required this.triggerPayload,
    required this.actionPayload,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    map['enabled'] = Variable<bool>(enabled);
    map['priority'] = Variable<int>(priority);
    map['trigger_type'] = Variable<String>(triggerType);
    map['trigger_payload'] = Variable<String>(triggerPayload);
    map['action_payload'] = Variable<String>(actionPayload);
    map['created_at'] = Variable<int>(createdAt);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  RulesCompanion toCompanion(bool nullToAbsent) {
    return RulesCompanion(
      id: Value(id),
      name: Value(name),
      enabled: Value(enabled),
      priority: Value(priority),
      triggerType: Value(triggerType),
      triggerPayload: Value(triggerPayload),
      actionPayload: Value(actionPayload),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory RuleRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return RuleRow(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      enabled: serializer.fromJson<bool>(json['enabled']),
      priority: serializer.fromJson<int>(json['priority']),
      triggerType: serializer.fromJson<String>(json['triggerType']),
      triggerPayload: serializer.fromJson<String>(json['triggerPayload']),
      actionPayload: serializer.fromJson<String>(json['actionPayload']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'enabled': serializer.toJson<bool>(enabled),
      'priority': serializer.toJson<int>(priority),
      'triggerType': serializer.toJson<String>(triggerType),
      'triggerPayload': serializer.toJson<String>(triggerPayload),
      'actionPayload': serializer.toJson<String>(actionPayload),
      'createdAt': serializer.toJson<int>(createdAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  RuleRow copyWith({
    String? id,
    String? name,
    bool? enabled,
    int? priority,
    String? triggerType,
    String? triggerPayload,
    String? actionPayload,
    int? createdAt,
    int? updatedAt,
  }) => RuleRow(
    id: id ?? this.id,
    name: name ?? this.name,
    enabled: enabled ?? this.enabled,
    priority: priority ?? this.priority,
    triggerType: triggerType ?? this.triggerType,
    triggerPayload: triggerPayload ?? this.triggerPayload,
    actionPayload: actionPayload ?? this.actionPayload,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  RuleRow copyWithCompanion(RulesCompanion data) {
    return RuleRow(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      enabled: data.enabled.present ? data.enabled.value : this.enabled,
      priority: data.priority.present ? data.priority.value : this.priority,
      triggerType: data.triggerType.present
          ? data.triggerType.value
          : this.triggerType,
      triggerPayload: data.triggerPayload.present
          ? data.triggerPayload.value
          : this.triggerPayload,
      actionPayload: data.actionPayload.present
          ? data.actionPayload.value
          : this.actionPayload,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('RuleRow(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('enabled: $enabled, ')
          ..write('priority: $priority, ')
          ..write('triggerType: $triggerType, ')
          ..write('triggerPayload: $triggerPayload, ')
          ..write('actionPayload: $actionPayload, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    name,
    enabled,
    priority,
    triggerType,
    triggerPayload,
    actionPayload,
    createdAt,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RuleRow &&
          other.id == this.id &&
          other.name == this.name &&
          other.enabled == this.enabled &&
          other.priority == this.priority &&
          other.triggerType == this.triggerType &&
          other.triggerPayload == this.triggerPayload &&
          other.actionPayload == this.actionPayload &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class RulesCompanion extends UpdateCompanion<RuleRow> {
  final Value<String> id;
  final Value<String> name;
  final Value<bool> enabled;
  final Value<int> priority;
  final Value<String> triggerType;
  final Value<String> triggerPayload;
  final Value<String> actionPayload;
  final Value<int> createdAt;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const RulesCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.enabled = const Value.absent(),
    this.priority = const Value.absent(),
    this.triggerType = const Value.absent(),
    this.triggerPayload = const Value.absent(),
    this.actionPayload = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  RulesCompanion.insert({
    required String id,
    required String name,
    this.enabled = const Value.absent(),
    this.priority = const Value.absent(),
    required String triggerType,
    required String triggerPayload,
    required String actionPayload,
    required int createdAt,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       triggerType = Value(triggerType),
       triggerPayload = Value(triggerPayload),
       actionPayload = Value(actionPayload),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<RuleRow> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<bool>? enabled,
    Expression<int>? priority,
    Expression<String>? triggerType,
    Expression<String>? triggerPayload,
    Expression<String>? actionPayload,
    Expression<int>? createdAt,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (enabled != null) 'enabled': enabled,
      if (priority != null) 'priority': priority,
      if (triggerType != null) 'trigger_type': triggerType,
      if (triggerPayload != null) 'trigger_payload': triggerPayload,
      if (actionPayload != null) 'action_payload': actionPayload,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  RulesCompanion copyWith({
    Value<String>? id,
    Value<String>? name,
    Value<bool>? enabled,
    Value<int>? priority,
    Value<String>? triggerType,
    Value<String>? triggerPayload,
    Value<String>? actionPayload,
    Value<int>? createdAt,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return RulesCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      enabled: enabled ?? this.enabled,
      priority: priority ?? this.priority,
      triggerType: triggerType ?? this.triggerType,
      triggerPayload: triggerPayload ?? this.triggerPayload,
      actionPayload: actionPayload ?? this.actionPayload,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (enabled.present) {
      map['enabled'] = Variable<bool>(enabled.value);
    }
    if (priority.present) {
      map['priority'] = Variable<int>(priority.value);
    }
    if (triggerType.present) {
      map['trigger_type'] = Variable<String>(triggerType.value);
    }
    if (triggerPayload.present) {
      map['trigger_payload'] = Variable<String>(triggerPayload.value);
    }
    if (actionPayload.present) {
      map['action_payload'] = Variable<String>(actionPayload.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('RulesCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('enabled: $enabled, ')
          ..write('priority: $priority, ')
          ..write('triggerType: $triggerType, ')
          ..write('triggerPayload: $triggerPayload, ')
          ..write('actionPayload: $actionPayload, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $RuleMatchesTable extends RuleMatches
    with TableInfo<$RuleMatchesTable, RuleMatchRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $RuleMatchesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _ruleIdMeta = const VerificationMeta('ruleId');
  @override
  late final GeneratedColumn<String> ruleId = GeneratedColumn<String>(
    'rule_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sourceTypeMeta = const VerificationMeta(
    'sourceType',
  );
  @override
  late final GeneratedColumn<String> sourceType = GeneratedColumn<String>(
    'source_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sourceIdMeta = const VerificationMeta(
    'sourceId',
  );
  @override
  late final GeneratedColumn<String> sourceId = GeneratedColumn<String>(
    'source_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _transactionIdMeta = const VerificationMeta(
    'transactionId',
  );
  @override
  late final GeneratedColumn<String> transactionId = GeneratedColumn<String>(
    'transaction_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _matchedAtMeta = const VerificationMeta(
    'matchedAt',
  );
  @override
  late final GeneratedColumn<int> matchedAt = GeneratedColumn<int>(
    'matched_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _outcomeMeta = const VerificationMeta(
    'outcome',
  );
  @override
  late final GeneratedColumn<String> outcome = GeneratedColumn<String>(
    'outcome',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    ruleId,
    sourceType,
    sourceId,
    transactionId,
    matchedAt,
    outcome,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'rule_matches';
  @override
  VerificationContext validateIntegrity(
    Insertable<RuleMatchRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('rule_id')) {
      context.handle(
        _ruleIdMeta,
        ruleId.isAcceptableOrUnknown(data['rule_id']!, _ruleIdMeta),
      );
    } else if (isInserting) {
      context.missing(_ruleIdMeta);
    }
    if (data.containsKey('source_type')) {
      context.handle(
        _sourceTypeMeta,
        sourceType.isAcceptableOrUnknown(data['source_type']!, _sourceTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_sourceTypeMeta);
    }
    if (data.containsKey('source_id')) {
      context.handle(
        _sourceIdMeta,
        sourceId.isAcceptableOrUnknown(data['source_id']!, _sourceIdMeta),
      );
    } else if (isInserting) {
      context.missing(_sourceIdMeta);
    }
    if (data.containsKey('transaction_id')) {
      context.handle(
        _transactionIdMeta,
        transactionId.isAcceptableOrUnknown(
          data['transaction_id']!,
          _transactionIdMeta,
        ),
      );
    }
    if (data.containsKey('matched_at')) {
      context.handle(
        _matchedAtMeta,
        matchedAt.isAcceptableOrUnknown(data['matched_at']!, _matchedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_matchedAtMeta);
    }
    if (data.containsKey('outcome')) {
      context.handle(
        _outcomeMeta,
        outcome.isAcceptableOrUnknown(data['outcome']!, _outcomeMeta),
      );
    } else if (isInserting) {
      context.missing(_outcomeMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  RuleMatchRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return RuleMatchRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      ruleId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}rule_id'],
      )!,
      sourceType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}source_type'],
      )!,
      sourceId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}source_id'],
      )!,
      transactionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}transaction_id'],
      ),
      matchedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}matched_at'],
      )!,
      outcome: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}outcome'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $RuleMatchesTable createAlias(String alias) {
    return $RuleMatchesTable(attachedDatabase, alias);
  }
}

class RuleMatchRow extends DataClass implements Insertable<RuleMatchRow> {
  final String id;
  final String ruleId;
  final String sourceType;
  final String sourceId;
  final String? transactionId;
  final int matchedAt;
  final String outcome;
  final int updatedAt;
  const RuleMatchRow({
    required this.id,
    required this.ruleId,
    required this.sourceType,
    required this.sourceId,
    this.transactionId,
    required this.matchedAt,
    required this.outcome,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['rule_id'] = Variable<String>(ruleId);
    map['source_type'] = Variable<String>(sourceType);
    map['source_id'] = Variable<String>(sourceId);
    if (!nullToAbsent || transactionId != null) {
      map['transaction_id'] = Variable<String>(transactionId);
    }
    map['matched_at'] = Variable<int>(matchedAt);
    map['outcome'] = Variable<String>(outcome);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  RuleMatchesCompanion toCompanion(bool nullToAbsent) {
    return RuleMatchesCompanion(
      id: Value(id),
      ruleId: Value(ruleId),
      sourceType: Value(sourceType),
      sourceId: Value(sourceId),
      transactionId: transactionId == null && nullToAbsent
          ? const Value.absent()
          : Value(transactionId),
      matchedAt: Value(matchedAt),
      outcome: Value(outcome),
      updatedAt: Value(updatedAt),
    );
  }

  factory RuleMatchRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return RuleMatchRow(
      id: serializer.fromJson<String>(json['id']),
      ruleId: serializer.fromJson<String>(json['ruleId']),
      sourceType: serializer.fromJson<String>(json['sourceType']),
      sourceId: serializer.fromJson<String>(json['sourceId']),
      transactionId: serializer.fromJson<String?>(json['transactionId']),
      matchedAt: serializer.fromJson<int>(json['matchedAt']),
      outcome: serializer.fromJson<String>(json['outcome']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'ruleId': serializer.toJson<String>(ruleId),
      'sourceType': serializer.toJson<String>(sourceType),
      'sourceId': serializer.toJson<String>(sourceId),
      'transactionId': serializer.toJson<String?>(transactionId),
      'matchedAt': serializer.toJson<int>(matchedAt),
      'outcome': serializer.toJson<String>(outcome),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  RuleMatchRow copyWith({
    String? id,
    String? ruleId,
    String? sourceType,
    String? sourceId,
    Value<String?> transactionId = const Value.absent(),
    int? matchedAt,
    String? outcome,
    int? updatedAt,
  }) => RuleMatchRow(
    id: id ?? this.id,
    ruleId: ruleId ?? this.ruleId,
    sourceType: sourceType ?? this.sourceType,
    sourceId: sourceId ?? this.sourceId,
    transactionId: transactionId.present
        ? transactionId.value
        : this.transactionId,
    matchedAt: matchedAt ?? this.matchedAt,
    outcome: outcome ?? this.outcome,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  RuleMatchRow copyWithCompanion(RuleMatchesCompanion data) {
    return RuleMatchRow(
      id: data.id.present ? data.id.value : this.id,
      ruleId: data.ruleId.present ? data.ruleId.value : this.ruleId,
      sourceType: data.sourceType.present
          ? data.sourceType.value
          : this.sourceType,
      sourceId: data.sourceId.present ? data.sourceId.value : this.sourceId,
      transactionId: data.transactionId.present
          ? data.transactionId.value
          : this.transactionId,
      matchedAt: data.matchedAt.present ? data.matchedAt.value : this.matchedAt,
      outcome: data.outcome.present ? data.outcome.value : this.outcome,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('RuleMatchRow(')
          ..write('id: $id, ')
          ..write('ruleId: $ruleId, ')
          ..write('sourceType: $sourceType, ')
          ..write('sourceId: $sourceId, ')
          ..write('transactionId: $transactionId, ')
          ..write('matchedAt: $matchedAt, ')
          ..write('outcome: $outcome, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    ruleId,
    sourceType,
    sourceId,
    transactionId,
    matchedAt,
    outcome,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RuleMatchRow &&
          other.id == this.id &&
          other.ruleId == this.ruleId &&
          other.sourceType == this.sourceType &&
          other.sourceId == this.sourceId &&
          other.transactionId == this.transactionId &&
          other.matchedAt == this.matchedAt &&
          other.outcome == this.outcome &&
          other.updatedAt == this.updatedAt);
}

class RuleMatchesCompanion extends UpdateCompanion<RuleMatchRow> {
  final Value<String> id;
  final Value<String> ruleId;
  final Value<String> sourceType;
  final Value<String> sourceId;
  final Value<String?> transactionId;
  final Value<int> matchedAt;
  final Value<String> outcome;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const RuleMatchesCompanion({
    this.id = const Value.absent(),
    this.ruleId = const Value.absent(),
    this.sourceType = const Value.absent(),
    this.sourceId = const Value.absent(),
    this.transactionId = const Value.absent(),
    this.matchedAt = const Value.absent(),
    this.outcome = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  RuleMatchesCompanion.insert({
    required String id,
    required String ruleId,
    required String sourceType,
    required String sourceId,
    this.transactionId = const Value.absent(),
    required int matchedAt,
    required String outcome,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       ruleId = Value(ruleId),
       sourceType = Value(sourceType),
       sourceId = Value(sourceId),
       matchedAt = Value(matchedAt),
       outcome = Value(outcome),
       updatedAt = Value(updatedAt);
  static Insertable<RuleMatchRow> custom({
    Expression<String>? id,
    Expression<String>? ruleId,
    Expression<String>? sourceType,
    Expression<String>? sourceId,
    Expression<String>? transactionId,
    Expression<int>? matchedAt,
    Expression<String>? outcome,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (ruleId != null) 'rule_id': ruleId,
      if (sourceType != null) 'source_type': sourceType,
      if (sourceId != null) 'source_id': sourceId,
      if (transactionId != null) 'transaction_id': transactionId,
      if (matchedAt != null) 'matched_at': matchedAt,
      if (outcome != null) 'outcome': outcome,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  RuleMatchesCompanion copyWith({
    Value<String>? id,
    Value<String>? ruleId,
    Value<String>? sourceType,
    Value<String>? sourceId,
    Value<String?>? transactionId,
    Value<int>? matchedAt,
    Value<String>? outcome,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return RuleMatchesCompanion(
      id: id ?? this.id,
      ruleId: ruleId ?? this.ruleId,
      sourceType: sourceType ?? this.sourceType,
      sourceId: sourceId ?? this.sourceId,
      transactionId: transactionId ?? this.transactionId,
      matchedAt: matchedAt ?? this.matchedAt,
      outcome: outcome ?? this.outcome,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (ruleId.present) {
      map['rule_id'] = Variable<String>(ruleId.value);
    }
    if (sourceType.present) {
      map['source_type'] = Variable<String>(sourceType.value);
    }
    if (sourceId.present) {
      map['source_id'] = Variable<String>(sourceId.value);
    }
    if (transactionId.present) {
      map['transaction_id'] = Variable<String>(transactionId.value);
    }
    if (matchedAt.present) {
      map['matched_at'] = Variable<int>(matchedAt.value);
    }
    if (outcome.present) {
      map['outcome'] = Variable<String>(outcome.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('RuleMatchesCompanion(')
          ..write('id: $id, ')
          ..write('ruleId: $ruleId, ')
          ..write('sourceType: $sourceType, ')
          ..write('sourceId: $sourceId, ')
          ..write('transactionId: $transactionId, ')
          ..write('matchedAt: $matchedAt, ')
          ..write('outcome: $outcome, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $BudgetsTable extends Budgets with TableInfo<$BudgetsTable, BudgetRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $BudgetsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _categoryIdMeta = const VerificationMeta(
    'categoryId',
  );
  @override
  late final GeneratedColumn<String> categoryId = GeneratedColumn<String>(
    'category_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _monthMeta = const VerificationMeta('month');
  @override
  late final GeneratedColumn<String> month = GeneratedColumn<String>(
    'month',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _targetCentsMeta = const VerificationMeta(
    'targetCents',
  );
  @override
  late final GeneratedColumn<int> targetCents = GeneratedColumn<int>(
    'target_cents',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _rolloverCentsMeta = const VerificationMeta(
    'rolloverCents',
  );
  @override
  late final GeneratedColumn<int> rolloverCents = GeneratedColumn<int>(
    'rollover_cents',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    categoryId,
    month,
    targetCents,
    rolloverCents,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'budgets';
  @override
  VerificationContext validateIntegrity(
    Insertable<BudgetRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('category_id')) {
      context.handle(
        _categoryIdMeta,
        categoryId.isAcceptableOrUnknown(data['category_id']!, _categoryIdMeta),
      );
    } else if (isInserting) {
      context.missing(_categoryIdMeta);
    }
    if (data.containsKey('month')) {
      context.handle(
        _monthMeta,
        month.isAcceptableOrUnknown(data['month']!, _monthMeta),
      );
    } else if (isInserting) {
      context.missing(_monthMeta);
    }
    if (data.containsKey('target_cents')) {
      context.handle(
        _targetCentsMeta,
        targetCents.isAcceptableOrUnknown(
          data['target_cents']!,
          _targetCentsMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_targetCentsMeta);
    }
    if (data.containsKey('rollover_cents')) {
      context.handle(
        _rolloverCentsMeta,
        rolloverCents.isAcceptableOrUnknown(
          data['rollover_cents']!,
          _rolloverCentsMeta,
        ),
      );
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  BudgetRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return BudgetRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      categoryId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}category_id'],
      )!,
      month: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}month'],
      )!,
      targetCents: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}target_cents'],
      )!,
      rolloverCents: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}rollover_cents'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $BudgetsTable createAlias(String alias) {
    return $BudgetsTable(attachedDatabase, alias);
  }
}

class BudgetRow extends DataClass implements Insertable<BudgetRow> {
  final String id;
  final String categoryId;
  final String month;
  final int targetCents;
  final int rolloverCents;
  final int updatedAt;
  const BudgetRow({
    required this.id,
    required this.categoryId,
    required this.month,
    required this.targetCents,
    required this.rolloverCents,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['category_id'] = Variable<String>(categoryId);
    map['month'] = Variable<String>(month);
    map['target_cents'] = Variable<int>(targetCents);
    map['rollover_cents'] = Variable<int>(rolloverCents);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  BudgetsCompanion toCompanion(bool nullToAbsent) {
    return BudgetsCompanion(
      id: Value(id),
      categoryId: Value(categoryId),
      month: Value(month),
      targetCents: Value(targetCents),
      rolloverCents: Value(rolloverCents),
      updatedAt: Value(updatedAt),
    );
  }

  factory BudgetRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return BudgetRow(
      id: serializer.fromJson<String>(json['id']),
      categoryId: serializer.fromJson<String>(json['categoryId']),
      month: serializer.fromJson<String>(json['month']),
      targetCents: serializer.fromJson<int>(json['targetCents']),
      rolloverCents: serializer.fromJson<int>(json['rolloverCents']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'categoryId': serializer.toJson<String>(categoryId),
      'month': serializer.toJson<String>(month),
      'targetCents': serializer.toJson<int>(targetCents),
      'rolloverCents': serializer.toJson<int>(rolloverCents),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  BudgetRow copyWith({
    String? id,
    String? categoryId,
    String? month,
    int? targetCents,
    int? rolloverCents,
    int? updatedAt,
  }) => BudgetRow(
    id: id ?? this.id,
    categoryId: categoryId ?? this.categoryId,
    month: month ?? this.month,
    targetCents: targetCents ?? this.targetCents,
    rolloverCents: rolloverCents ?? this.rolloverCents,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  BudgetRow copyWithCompanion(BudgetsCompanion data) {
    return BudgetRow(
      id: data.id.present ? data.id.value : this.id,
      categoryId: data.categoryId.present
          ? data.categoryId.value
          : this.categoryId,
      month: data.month.present ? data.month.value : this.month,
      targetCents: data.targetCents.present
          ? data.targetCents.value
          : this.targetCents,
      rolloverCents: data.rolloverCents.present
          ? data.rolloverCents.value
          : this.rolloverCents,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('BudgetRow(')
          ..write('id: $id, ')
          ..write('categoryId: $categoryId, ')
          ..write('month: $month, ')
          ..write('targetCents: $targetCents, ')
          ..write('rolloverCents: $rolloverCents, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, categoryId, month, targetCents, rolloverCents, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is BudgetRow &&
          other.id == this.id &&
          other.categoryId == this.categoryId &&
          other.month == this.month &&
          other.targetCents == this.targetCents &&
          other.rolloverCents == this.rolloverCents &&
          other.updatedAt == this.updatedAt);
}

class BudgetsCompanion extends UpdateCompanion<BudgetRow> {
  final Value<String> id;
  final Value<String> categoryId;
  final Value<String> month;
  final Value<int> targetCents;
  final Value<int> rolloverCents;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const BudgetsCompanion({
    this.id = const Value.absent(),
    this.categoryId = const Value.absent(),
    this.month = const Value.absent(),
    this.targetCents = const Value.absent(),
    this.rolloverCents = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  BudgetsCompanion.insert({
    required String id,
    required String categoryId,
    required String month,
    required int targetCents,
    this.rolloverCents = const Value.absent(),
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       categoryId = Value(categoryId),
       month = Value(month),
       targetCents = Value(targetCents),
       updatedAt = Value(updatedAt);
  static Insertable<BudgetRow> custom({
    Expression<String>? id,
    Expression<String>? categoryId,
    Expression<String>? month,
    Expression<int>? targetCents,
    Expression<int>? rolloverCents,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (categoryId != null) 'category_id': categoryId,
      if (month != null) 'month': month,
      if (targetCents != null) 'target_cents': targetCents,
      if (rolloverCents != null) 'rollover_cents': rolloverCents,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  BudgetsCompanion copyWith({
    Value<String>? id,
    Value<String>? categoryId,
    Value<String>? month,
    Value<int>? targetCents,
    Value<int>? rolloverCents,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return BudgetsCompanion(
      id: id ?? this.id,
      categoryId: categoryId ?? this.categoryId,
      month: month ?? this.month,
      targetCents: targetCents ?? this.targetCents,
      rolloverCents: rolloverCents ?? this.rolloverCents,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (categoryId.present) {
      map['category_id'] = Variable<String>(categoryId.value);
    }
    if (month.present) {
      map['month'] = Variable<String>(month.value);
    }
    if (targetCents.present) {
      map['target_cents'] = Variable<int>(targetCents.value);
    }
    if (rolloverCents.present) {
      map['rollover_cents'] = Variable<int>(rolloverCents.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('BudgetsCompanion(')
          ..write('id: $id, ')
          ..write('categoryId: $categoryId, ')
          ..write('month: $month, ')
          ..write('targetCents: $targetCents, ')
          ..write('rolloverCents: $rolloverCents, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $RecurrencesTable extends Recurrences
    with TableInfo<$RecurrencesTable, RecurrenceRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $RecurrencesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _accountIdMeta = const VerificationMeta(
    'accountId',
  );
  @override
  late final GeneratedColumn<String> accountId = GeneratedColumn<String>(
    'account_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _categoryIdMeta = const VerificationMeta(
    'categoryId',
  );
  @override
  late final GeneratedColumn<String> categoryId = GeneratedColumn<String>(
    'category_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _payeeIdMeta = const VerificationMeta(
    'payeeId',
  );
  @override
  late final GeneratedColumn<String> payeeId = GeneratedColumn<String>(
    'payee_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _payeeNameMeta = const VerificationMeta(
    'payeeName',
  );
  @override
  late final GeneratedColumn<String> payeeName = GeneratedColumn<String>(
    'payee_name',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _amountCentsMeta = const VerificationMeta(
    'amountCents',
  );
  @override
  late final GeneratedColumn<int> amountCents = GeneratedColumn<int>(
    'amount_cents',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _notesMeta = const VerificationMeta('notes');
  @override
  late final GeneratedColumn<String> notes = GeneratedColumn<String>(
    'notes',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _cadenceMeta = const VerificationMeta(
    'cadence',
  );
  @override
  late final GeneratedColumn<String> cadence = GeneratedColumn<String>(
    'cadence',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nextDateMeta = const VerificationMeta(
    'nextDate',
  );
  @override
  late final GeneratedColumn<String> nextDate = GeneratedColumn<String>(
    'next_date',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _anchorDayMeta = const VerificationMeta(
    'anchorDay',
  );
  @override
  late final GeneratedColumn<int> anchorDay = GeneratedColumn<int>(
    'anchor_day',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    accountId,
    categoryId,
    payeeId,
    payeeName,
    amountCents,
    notes,
    cadence,
    nextDate,
    anchorDay,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'recurrences';
  @override
  VerificationContext validateIntegrity(
    Insertable<RecurrenceRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('account_id')) {
      context.handle(
        _accountIdMeta,
        accountId.isAcceptableOrUnknown(data['account_id']!, _accountIdMeta),
      );
    } else if (isInserting) {
      context.missing(_accountIdMeta);
    }
    if (data.containsKey('category_id')) {
      context.handle(
        _categoryIdMeta,
        categoryId.isAcceptableOrUnknown(data['category_id']!, _categoryIdMeta),
      );
    }
    if (data.containsKey('payee_id')) {
      context.handle(
        _payeeIdMeta,
        payeeId.isAcceptableOrUnknown(data['payee_id']!, _payeeIdMeta),
      );
    }
    if (data.containsKey('payee_name')) {
      context.handle(
        _payeeNameMeta,
        payeeName.isAcceptableOrUnknown(data['payee_name']!, _payeeNameMeta),
      );
    }
    if (data.containsKey('amount_cents')) {
      context.handle(
        _amountCentsMeta,
        amountCents.isAcceptableOrUnknown(
          data['amount_cents']!,
          _amountCentsMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_amountCentsMeta);
    }
    if (data.containsKey('notes')) {
      context.handle(
        _notesMeta,
        notes.isAcceptableOrUnknown(data['notes']!, _notesMeta),
      );
    }
    if (data.containsKey('cadence')) {
      context.handle(
        _cadenceMeta,
        cadence.isAcceptableOrUnknown(data['cadence']!, _cadenceMeta),
      );
    } else if (isInserting) {
      context.missing(_cadenceMeta);
    }
    if (data.containsKey('next_date')) {
      context.handle(
        _nextDateMeta,
        nextDate.isAcceptableOrUnknown(data['next_date']!, _nextDateMeta),
      );
    } else if (isInserting) {
      context.missing(_nextDateMeta);
    }
    if (data.containsKey('anchor_day')) {
      context.handle(
        _anchorDayMeta,
        anchorDay.isAcceptableOrUnknown(data['anchor_day']!, _anchorDayMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  RecurrenceRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return RecurrenceRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      accountId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}account_id'],
      )!,
      categoryId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}category_id'],
      ),
      payeeId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payee_id'],
      ),
      payeeName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payee_name'],
      ),
      amountCents: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}amount_cents'],
      )!,
      notes: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}notes'],
      ),
      cadence: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cadence'],
      )!,
      nextDate: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}next_date'],
      )!,
      anchorDay: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}anchor_day'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $RecurrencesTable createAlias(String alias) {
    return $RecurrencesTable(attachedDatabase, alias);
  }
}

class RecurrenceRow extends DataClass implements Insertable<RecurrenceRow> {
  final String id;
  final String accountId;
  final String? categoryId;
  final String? payeeId;
  final String? payeeName;
  final int amountCents;
  final String? notes;
  final String cadence;
  final String nextDate;
  final int? anchorDay;
  final int createdAt;
  final int updatedAt;
  const RecurrenceRow({
    required this.id,
    required this.accountId,
    this.categoryId,
    this.payeeId,
    this.payeeName,
    required this.amountCents,
    this.notes,
    required this.cadence,
    required this.nextDate,
    this.anchorDay,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['account_id'] = Variable<String>(accountId);
    if (!nullToAbsent || categoryId != null) {
      map['category_id'] = Variable<String>(categoryId);
    }
    if (!nullToAbsent || payeeId != null) {
      map['payee_id'] = Variable<String>(payeeId);
    }
    if (!nullToAbsent || payeeName != null) {
      map['payee_name'] = Variable<String>(payeeName);
    }
    map['amount_cents'] = Variable<int>(amountCents);
    if (!nullToAbsent || notes != null) {
      map['notes'] = Variable<String>(notes);
    }
    map['cadence'] = Variable<String>(cadence);
    map['next_date'] = Variable<String>(nextDate);
    if (!nullToAbsent || anchorDay != null) {
      map['anchor_day'] = Variable<int>(anchorDay);
    }
    map['created_at'] = Variable<int>(createdAt);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  RecurrencesCompanion toCompanion(bool nullToAbsent) {
    return RecurrencesCompanion(
      id: Value(id),
      accountId: Value(accountId),
      categoryId: categoryId == null && nullToAbsent
          ? const Value.absent()
          : Value(categoryId),
      payeeId: payeeId == null && nullToAbsent
          ? const Value.absent()
          : Value(payeeId),
      payeeName: payeeName == null && nullToAbsent
          ? const Value.absent()
          : Value(payeeName),
      amountCents: Value(amountCents),
      notes: notes == null && nullToAbsent
          ? const Value.absent()
          : Value(notes),
      cadence: Value(cadence),
      nextDate: Value(nextDate),
      anchorDay: anchorDay == null && nullToAbsent
          ? const Value.absent()
          : Value(anchorDay),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory RecurrenceRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return RecurrenceRow(
      id: serializer.fromJson<String>(json['id']),
      accountId: serializer.fromJson<String>(json['accountId']),
      categoryId: serializer.fromJson<String?>(json['categoryId']),
      payeeId: serializer.fromJson<String?>(json['payeeId']),
      payeeName: serializer.fromJson<String?>(json['payeeName']),
      amountCents: serializer.fromJson<int>(json['amountCents']),
      notes: serializer.fromJson<String?>(json['notes']),
      cadence: serializer.fromJson<String>(json['cadence']),
      nextDate: serializer.fromJson<String>(json['nextDate']),
      anchorDay: serializer.fromJson<int?>(json['anchorDay']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'accountId': serializer.toJson<String>(accountId),
      'categoryId': serializer.toJson<String?>(categoryId),
      'payeeId': serializer.toJson<String?>(payeeId),
      'payeeName': serializer.toJson<String?>(payeeName),
      'amountCents': serializer.toJson<int>(amountCents),
      'notes': serializer.toJson<String?>(notes),
      'cadence': serializer.toJson<String>(cadence),
      'nextDate': serializer.toJson<String>(nextDate),
      'anchorDay': serializer.toJson<int?>(anchorDay),
      'createdAt': serializer.toJson<int>(createdAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  RecurrenceRow copyWith({
    String? id,
    String? accountId,
    Value<String?> categoryId = const Value.absent(),
    Value<String?> payeeId = const Value.absent(),
    Value<String?> payeeName = const Value.absent(),
    int? amountCents,
    Value<String?> notes = const Value.absent(),
    String? cadence,
    String? nextDate,
    Value<int?> anchorDay = const Value.absent(),
    int? createdAt,
    int? updatedAt,
  }) => RecurrenceRow(
    id: id ?? this.id,
    accountId: accountId ?? this.accountId,
    categoryId: categoryId.present ? categoryId.value : this.categoryId,
    payeeId: payeeId.present ? payeeId.value : this.payeeId,
    payeeName: payeeName.present ? payeeName.value : this.payeeName,
    amountCents: amountCents ?? this.amountCents,
    notes: notes.present ? notes.value : this.notes,
    cadence: cadence ?? this.cadence,
    nextDate: nextDate ?? this.nextDate,
    anchorDay: anchorDay.present ? anchorDay.value : this.anchorDay,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  RecurrenceRow copyWithCompanion(RecurrencesCompanion data) {
    return RecurrenceRow(
      id: data.id.present ? data.id.value : this.id,
      accountId: data.accountId.present ? data.accountId.value : this.accountId,
      categoryId: data.categoryId.present
          ? data.categoryId.value
          : this.categoryId,
      payeeId: data.payeeId.present ? data.payeeId.value : this.payeeId,
      payeeName: data.payeeName.present ? data.payeeName.value : this.payeeName,
      amountCents: data.amountCents.present
          ? data.amountCents.value
          : this.amountCents,
      notes: data.notes.present ? data.notes.value : this.notes,
      cadence: data.cadence.present ? data.cadence.value : this.cadence,
      nextDate: data.nextDate.present ? data.nextDate.value : this.nextDate,
      anchorDay: data.anchorDay.present ? data.anchorDay.value : this.anchorDay,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('RecurrenceRow(')
          ..write('id: $id, ')
          ..write('accountId: $accountId, ')
          ..write('categoryId: $categoryId, ')
          ..write('payeeId: $payeeId, ')
          ..write('payeeName: $payeeName, ')
          ..write('amountCents: $amountCents, ')
          ..write('notes: $notes, ')
          ..write('cadence: $cadence, ')
          ..write('nextDate: $nextDate, ')
          ..write('anchorDay: $anchorDay, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    accountId,
    categoryId,
    payeeId,
    payeeName,
    amountCents,
    notes,
    cadence,
    nextDate,
    anchorDay,
    createdAt,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RecurrenceRow &&
          other.id == this.id &&
          other.accountId == this.accountId &&
          other.categoryId == this.categoryId &&
          other.payeeId == this.payeeId &&
          other.payeeName == this.payeeName &&
          other.amountCents == this.amountCents &&
          other.notes == this.notes &&
          other.cadence == this.cadence &&
          other.nextDate == this.nextDate &&
          other.anchorDay == this.anchorDay &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class RecurrencesCompanion extends UpdateCompanion<RecurrenceRow> {
  final Value<String> id;
  final Value<String> accountId;
  final Value<String?> categoryId;
  final Value<String?> payeeId;
  final Value<String?> payeeName;
  final Value<int> amountCents;
  final Value<String?> notes;
  final Value<String> cadence;
  final Value<String> nextDate;
  final Value<int?> anchorDay;
  final Value<int> createdAt;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const RecurrencesCompanion({
    this.id = const Value.absent(),
    this.accountId = const Value.absent(),
    this.categoryId = const Value.absent(),
    this.payeeId = const Value.absent(),
    this.payeeName = const Value.absent(),
    this.amountCents = const Value.absent(),
    this.notes = const Value.absent(),
    this.cadence = const Value.absent(),
    this.nextDate = const Value.absent(),
    this.anchorDay = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  RecurrencesCompanion.insert({
    required String id,
    required String accountId,
    this.categoryId = const Value.absent(),
    this.payeeId = const Value.absent(),
    this.payeeName = const Value.absent(),
    required int amountCents,
    this.notes = const Value.absent(),
    required String cadence,
    required String nextDate,
    this.anchorDay = const Value.absent(),
    required int createdAt,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       accountId = Value(accountId),
       amountCents = Value(amountCents),
       cadence = Value(cadence),
       nextDate = Value(nextDate),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<RecurrenceRow> custom({
    Expression<String>? id,
    Expression<String>? accountId,
    Expression<String>? categoryId,
    Expression<String>? payeeId,
    Expression<String>? payeeName,
    Expression<int>? amountCents,
    Expression<String>? notes,
    Expression<String>? cadence,
    Expression<String>? nextDate,
    Expression<int>? anchorDay,
    Expression<int>? createdAt,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (accountId != null) 'account_id': accountId,
      if (categoryId != null) 'category_id': categoryId,
      if (payeeId != null) 'payee_id': payeeId,
      if (payeeName != null) 'payee_name': payeeName,
      if (amountCents != null) 'amount_cents': amountCents,
      if (notes != null) 'notes': notes,
      if (cadence != null) 'cadence': cadence,
      if (nextDate != null) 'next_date': nextDate,
      if (anchorDay != null) 'anchor_day': anchorDay,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  RecurrencesCompanion copyWith({
    Value<String>? id,
    Value<String>? accountId,
    Value<String?>? categoryId,
    Value<String?>? payeeId,
    Value<String?>? payeeName,
    Value<int>? amountCents,
    Value<String?>? notes,
    Value<String>? cadence,
    Value<String>? nextDate,
    Value<int?>? anchorDay,
    Value<int>? createdAt,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return RecurrencesCompanion(
      id: id ?? this.id,
      accountId: accountId ?? this.accountId,
      categoryId: categoryId ?? this.categoryId,
      payeeId: payeeId ?? this.payeeId,
      payeeName: payeeName ?? this.payeeName,
      amountCents: amountCents ?? this.amountCents,
      notes: notes ?? this.notes,
      cadence: cadence ?? this.cadence,
      nextDate: nextDate ?? this.nextDate,
      anchorDay: anchorDay ?? this.anchorDay,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (accountId.present) {
      map['account_id'] = Variable<String>(accountId.value);
    }
    if (categoryId.present) {
      map['category_id'] = Variable<String>(categoryId.value);
    }
    if (payeeId.present) {
      map['payee_id'] = Variable<String>(payeeId.value);
    }
    if (payeeName.present) {
      map['payee_name'] = Variable<String>(payeeName.value);
    }
    if (amountCents.present) {
      map['amount_cents'] = Variable<int>(amountCents.value);
    }
    if (notes.present) {
      map['notes'] = Variable<String>(notes.value);
    }
    if (cadence.present) {
      map['cadence'] = Variable<String>(cadence.value);
    }
    if (nextDate.present) {
      map['next_date'] = Variable<String>(nextDate.value);
    }
    if (anchorDay.present) {
      map['anchor_day'] = Variable<int>(anchorDay.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('RecurrencesCompanion(')
          ..write('id: $id, ')
          ..write('accountId: $accountId, ')
          ..write('categoryId: $categoryId, ')
          ..write('payeeId: $payeeId, ')
          ..write('payeeName: $payeeName, ')
          ..write('amountCents: $amountCents, ')
          ..write('notes: $notes, ')
          ..write('cadence: $cadence, ')
          ..write('nextDate: $nextDate, ')
          ..write('anchorDay: $anchorDay, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SmsMessagesTable extends SmsMessages
    with TableInfo<$SmsMessagesTable, SmsRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SmsMessagesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _androidIdMeta = const VerificationMeta(
    'androidId',
  );
  @override
  late final GeneratedColumn<String> androidId = GeneratedColumn<String>(
    'android_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _addressMeta = const VerificationMeta(
    'address',
  );
  @override
  late final GeneratedColumn<String> address = GeneratedColumn<String>(
    'address',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _bodyMeta = const VerificationMeta('body');
  @override
  late final GeneratedColumn<String> body = GeneratedColumn<String>(
    'body',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _receivedAtMeta = const VerificationMeta(
    'receivedAt',
  );
  @override
  late final GeneratedColumn<int> receivedAt = GeneratedColumn<int>(
    'received_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _classifiedAsMeta = const VerificationMeta(
    'classifiedAs',
  );
  @override
  late final GeneratedColumn<String> classifiedAs = GeneratedColumn<String>(
    'classified_as',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('pending'),
  );
  static const VerificationMeta _parserVersionMeta = const VerificationMeta(
    'parserVersion',
  );
  @override
  late final GeneratedColumn<int> parserVersion = GeneratedColumn<int>(
    'parser_version',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _candidateJsonMeta = const VerificationMeta(
    'candidateJson',
  );
  @override
  late final GeneratedColumn<String> candidateJson = GeneratedColumn<String>(
    'candidate_json',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _candidateStatusMeta = const VerificationMeta(
    'candidateStatus',
  );
  @override
  late final GeneratedColumn<String> candidateStatus = GeneratedColumn<String>(
    'candidate_status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('none'),
  );
  static const VerificationMeta _linkedTransactionIdMeta =
      const VerificationMeta('linkedTransactionId');
  @override
  late final GeneratedColumn<String> linkedTransactionId =
      GeneratedColumn<String>(
        'linked_transaction_id',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _userNoteMeta = const VerificationMeta(
    'userNote',
  );
  @override
  late final GeneratedColumn<String> userNote = GeneratedColumn<String>(
    'user_note',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _noteCapturedAtMeta = const VerificationMeta(
    'noteCapturedAt',
  );
  @override
  late final GeneratedColumn<int> noteCapturedAt = GeneratedColumn<int>(
    'note_captured_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _locationLatMeta = const VerificationMeta(
    'locationLat',
  );
  @override
  late final GeneratedColumn<double> locationLat = GeneratedColumn<double>(
    'location_lat',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _locationLngMeta = const VerificationMeta(
    'locationLng',
  );
  @override
  late final GeneratedColumn<double> locationLng = GeneratedColumn<double>(
    'location_lng',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _locationAccuracyMMeta = const VerificationMeta(
    'locationAccuracyM',
  );
  @override
  late final GeneratedColumn<int> locationAccuracyM = GeneratedColumn<int>(
    'location_accuracy_m',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _locationCapturedAtMeta =
      const VerificationMeta('locationCapturedAt');
  @override
  late final GeneratedColumn<int> locationCapturedAt = GeneratedColumn<int>(
    'location_captured_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _locationPlaceNameMeta = const VerificationMeta(
    'locationPlaceName',
  );
  @override
  late final GeneratedColumn<String> locationPlaceName =
      GeneratedColumn<String>(
        'location_place_name',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _enrichmentStatusMeta = const VerificationMeta(
    'enrichmentStatus',
  );
  @override
  late final GeneratedColumn<String> enrichmentStatus = GeneratedColumn<String>(
    'enrichment_status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('none'),
  );
  static const VerificationMeta _enrichedCandidateJsonMeta =
      const VerificationMeta('enrichedCandidateJson');
  @override
  late final GeneratedColumn<String> enrichedCandidateJson =
      GeneratedColumn<String>(
        'enriched_candidate_json',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _enrichedAtMeta = const VerificationMeta(
    'enrichedAt',
  );
  @override
  late final GeneratedColumn<int> enrichedAt = GeneratedColumn<int>(
    'enriched_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _stableSmsIdMeta = const VerificationMeta(
    'stableSmsId',
  );
  @override
  late final GeneratedColumn<String> stableSmsId = GeneratedColumn<String>(
    'stable_sms_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _parseAttemptCountMeta = const VerificationMeta(
    'parseAttemptCount',
  );
  @override
  late final GeneratedColumn<int> parseAttemptCount = GeneratedColumn<int>(
    'parse_attempt_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _nextParseAfterMeta = const VerificationMeta(
    'nextParseAfter',
  );
  @override
  late final GeneratedColumn<int> nextParseAfter = GeneratedColumn<int>(
    'next_parse_after',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _lastParseErrorMeta = const VerificationMeta(
    'lastParseError',
  );
  @override
  late final GeneratedColumn<String> lastParseError = GeneratedColumn<String>(
    'last_parse_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _parsedAtMeta = const VerificationMeta(
    'parsedAt',
  );
  @override
  late final GeneratedColumn<int> parsedAt = GeneratedColumn<int>(
    'parsed_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    androidId,
    address,
    body,
    receivedAt,
    classifiedAs,
    parserVersion,
    candidateJson,
    candidateStatus,
    linkedTransactionId,
    userNote,
    noteCapturedAt,
    locationLat,
    locationLng,
    locationAccuracyM,
    locationCapturedAt,
    locationPlaceName,
    enrichmentStatus,
    enrichedCandidateJson,
    enrichedAt,
    stableSmsId,
    parseAttemptCount,
    nextParseAfter,
    lastParseError,
    parsedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sms_messages';
  @override
  VerificationContext validateIntegrity(
    Insertable<SmsRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('android_id')) {
      context.handle(
        _androidIdMeta,
        androidId.isAcceptableOrUnknown(data['android_id']!, _androidIdMeta),
      );
    }
    if (data.containsKey('address')) {
      context.handle(
        _addressMeta,
        address.isAcceptableOrUnknown(data['address']!, _addressMeta),
      );
    } else if (isInserting) {
      context.missing(_addressMeta);
    }
    if (data.containsKey('body')) {
      context.handle(
        _bodyMeta,
        body.isAcceptableOrUnknown(data['body']!, _bodyMeta),
      );
    } else if (isInserting) {
      context.missing(_bodyMeta);
    }
    if (data.containsKey('received_at')) {
      context.handle(
        _receivedAtMeta,
        receivedAt.isAcceptableOrUnknown(data['received_at']!, _receivedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_receivedAtMeta);
    }
    if (data.containsKey('classified_as')) {
      context.handle(
        _classifiedAsMeta,
        classifiedAs.isAcceptableOrUnknown(
          data['classified_as']!,
          _classifiedAsMeta,
        ),
      );
    }
    if (data.containsKey('parser_version')) {
      context.handle(
        _parserVersionMeta,
        parserVersion.isAcceptableOrUnknown(
          data['parser_version']!,
          _parserVersionMeta,
        ),
      );
    }
    if (data.containsKey('candidate_json')) {
      context.handle(
        _candidateJsonMeta,
        candidateJson.isAcceptableOrUnknown(
          data['candidate_json']!,
          _candidateJsonMeta,
        ),
      );
    }
    if (data.containsKey('candidate_status')) {
      context.handle(
        _candidateStatusMeta,
        candidateStatus.isAcceptableOrUnknown(
          data['candidate_status']!,
          _candidateStatusMeta,
        ),
      );
    }
    if (data.containsKey('linked_transaction_id')) {
      context.handle(
        _linkedTransactionIdMeta,
        linkedTransactionId.isAcceptableOrUnknown(
          data['linked_transaction_id']!,
          _linkedTransactionIdMeta,
        ),
      );
    }
    if (data.containsKey('user_note')) {
      context.handle(
        _userNoteMeta,
        userNote.isAcceptableOrUnknown(data['user_note']!, _userNoteMeta),
      );
    }
    if (data.containsKey('note_captured_at')) {
      context.handle(
        _noteCapturedAtMeta,
        noteCapturedAt.isAcceptableOrUnknown(
          data['note_captured_at']!,
          _noteCapturedAtMeta,
        ),
      );
    }
    if (data.containsKey('location_lat')) {
      context.handle(
        _locationLatMeta,
        locationLat.isAcceptableOrUnknown(
          data['location_lat']!,
          _locationLatMeta,
        ),
      );
    }
    if (data.containsKey('location_lng')) {
      context.handle(
        _locationLngMeta,
        locationLng.isAcceptableOrUnknown(
          data['location_lng']!,
          _locationLngMeta,
        ),
      );
    }
    if (data.containsKey('location_accuracy_m')) {
      context.handle(
        _locationAccuracyMMeta,
        locationAccuracyM.isAcceptableOrUnknown(
          data['location_accuracy_m']!,
          _locationAccuracyMMeta,
        ),
      );
    }
    if (data.containsKey('location_captured_at')) {
      context.handle(
        _locationCapturedAtMeta,
        locationCapturedAt.isAcceptableOrUnknown(
          data['location_captured_at']!,
          _locationCapturedAtMeta,
        ),
      );
    }
    if (data.containsKey('location_place_name')) {
      context.handle(
        _locationPlaceNameMeta,
        locationPlaceName.isAcceptableOrUnknown(
          data['location_place_name']!,
          _locationPlaceNameMeta,
        ),
      );
    }
    if (data.containsKey('enrichment_status')) {
      context.handle(
        _enrichmentStatusMeta,
        enrichmentStatus.isAcceptableOrUnknown(
          data['enrichment_status']!,
          _enrichmentStatusMeta,
        ),
      );
    }
    if (data.containsKey('enriched_candidate_json')) {
      context.handle(
        _enrichedCandidateJsonMeta,
        enrichedCandidateJson.isAcceptableOrUnknown(
          data['enriched_candidate_json']!,
          _enrichedCandidateJsonMeta,
        ),
      );
    }
    if (data.containsKey('enriched_at')) {
      context.handle(
        _enrichedAtMeta,
        enrichedAt.isAcceptableOrUnknown(data['enriched_at']!, _enrichedAtMeta),
      );
    }
    if (data.containsKey('stable_sms_id')) {
      context.handle(
        _stableSmsIdMeta,
        stableSmsId.isAcceptableOrUnknown(
          data['stable_sms_id']!,
          _stableSmsIdMeta,
        ),
      );
    }
    if (data.containsKey('parse_attempt_count')) {
      context.handle(
        _parseAttemptCountMeta,
        parseAttemptCount.isAcceptableOrUnknown(
          data['parse_attempt_count']!,
          _parseAttemptCountMeta,
        ),
      );
    }
    if (data.containsKey('next_parse_after')) {
      context.handle(
        _nextParseAfterMeta,
        nextParseAfter.isAcceptableOrUnknown(
          data['next_parse_after']!,
          _nextParseAfterMeta,
        ),
      );
    }
    if (data.containsKey('last_parse_error')) {
      context.handle(
        _lastParseErrorMeta,
        lastParseError.isAcceptableOrUnknown(
          data['last_parse_error']!,
          _lastParseErrorMeta,
        ),
      );
    }
    if (data.containsKey('parsed_at')) {
      context.handle(
        _parsedAtMeta,
        parsedAt.isAcceptableOrUnknown(data['parsed_at']!, _parsedAtMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  SmsRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SmsRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      androidId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}android_id'],
      ),
      address: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}address'],
      )!,
      body: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}body'],
      )!,
      receivedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}received_at'],
      )!,
      classifiedAs: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}classified_as'],
      )!,
      parserVersion: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}parser_version'],
      ),
      candidateJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}candidate_json'],
      ),
      candidateStatus: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}candidate_status'],
      )!,
      linkedTransactionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}linked_transaction_id'],
      ),
      userNote: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}user_note'],
      ),
      noteCapturedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}note_captured_at'],
      ),
      locationLat: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}location_lat'],
      ),
      locationLng: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}location_lng'],
      ),
      locationAccuracyM: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}location_accuracy_m'],
      ),
      locationCapturedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}location_captured_at'],
      ),
      locationPlaceName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}location_place_name'],
      ),
      enrichmentStatus: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}enrichment_status'],
      )!,
      enrichedCandidateJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}enriched_candidate_json'],
      ),
      enrichedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}enriched_at'],
      ),
      stableSmsId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}stable_sms_id'],
      ),
      parseAttemptCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}parse_attempt_count'],
      )!,
      nextParseAfter: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}next_parse_after'],
      ),
      lastParseError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}last_parse_error'],
      ),
      parsedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}parsed_at'],
      ),
    );
  }

  @override
  $SmsMessagesTable createAlias(String alias) {
    return $SmsMessagesTable(attachedDatabase, alias);
  }
}

class SmsRow extends DataClass implements Insertable<SmsRow> {
  final int id;
  final String? androidId;
  final String address;
  final String body;
  final int receivedAt;
  final String classifiedAs;
  final int? parserVersion;
  final String? candidateJson;
  final String candidateStatus;
  final String? linkedTransactionId;
  final String? userNote;
  final int? noteCapturedAt;
  final double? locationLat;
  final double? locationLng;
  final int? locationAccuracyM;
  final int? locationCapturedAt;
  final String? locationPlaceName;
  final String enrichmentStatus;
  final String? enrichedCandidateJson;
  final int? enrichedAt;
  final String? stableSmsId;
  final int parseAttemptCount;
  final int? nextParseAfter;
  final String? lastParseError;
  final int? parsedAt;
  const SmsRow({
    required this.id,
    this.androidId,
    required this.address,
    required this.body,
    required this.receivedAt,
    required this.classifiedAs,
    this.parserVersion,
    this.candidateJson,
    required this.candidateStatus,
    this.linkedTransactionId,
    this.userNote,
    this.noteCapturedAt,
    this.locationLat,
    this.locationLng,
    this.locationAccuracyM,
    this.locationCapturedAt,
    this.locationPlaceName,
    required this.enrichmentStatus,
    this.enrichedCandidateJson,
    this.enrichedAt,
    this.stableSmsId,
    required this.parseAttemptCount,
    this.nextParseAfter,
    this.lastParseError,
    this.parsedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    if (!nullToAbsent || androidId != null) {
      map['android_id'] = Variable<String>(androidId);
    }
    map['address'] = Variable<String>(address);
    map['body'] = Variable<String>(body);
    map['received_at'] = Variable<int>(receivedAt);
    map['classified_as'] = Variable<String>(classifiedAs);
    if (!nullToAbsent || parserVersion != null) {
      map['parser_version'] = Variable<int>(parserVersion);
    }
    if (!nullToAbsent || candidateJson != null) {
      map['candidate_json'] = Variable<String>(candidateJson);
    }
    map['candidate_status'] = Variable<String>(candidateStatus);
    if (!nullToAbsent || linkedTransactionId != null) {
      map['linked_transaction_id'] = Variable<String>(linkedTransactionId);
    }
    if (!nullToAbsent || userNote != null) {
      map['user_note'] = Variable<String>(userNote);
    }
    if (!nullToAbsent || noteCapturedAt != null) {
      map['note_captured_at'] = Variable<int>(noteCapturedAt);
    }
    if (!nullToAbsent || locationLat != null) {
      map['location_lat'] = Variable<double>(locationLat);
    }
    if (!nullToAbsent || locationLng != null) {
      map['location_lng'] = Variable<double>(locationLng);
    }
    if (!nullToAbsent || locationAccuracyM != null) {
      map['location_accuracy_m'] = Variable<int>(locationAccuracyM);
    }
    if (!nullToAbsent || locationCapturedAt != null) {
      map['location_captured_at'] = Variable<int>(locationCapturedAt);
    }
    if (!nullToAbsent || locationPlaceName != null) {
      map['location_place_name'] = Variable<String>(locationPlaceName);
    }
    map['enrichment_status'] = Variable<String>(enrichmentStatus);
    if (!nullToAbsent || enrichedCandidateJson != null) {
      map['enriched_candidate_json'] = Variable<String>(enrichedCandidateJson);
    }
    if (!nullToAbsent || enrichedAt != null) {
      map['enriched_at'] = Variable<int>(enrichedAt);
    }
    if (!nullToAbsent || stableSmsId != null) {
      map['stable_sms_id'] = Variable<String>(stableSmsId);
    }
    map['parse_attempt_count'] = Variable<int>(parseAttemptCount);
    if (!nullToAbsent || nextParseAfter != null) {
      map['next_parse_after'] = Variable<int>(nextParseAfter);
    }
    if (!nullToAbsent || lastParseError != null) {
      map['last_parse_error'] = Variable<String>(lastParseError);
    }
    if (!nullToAbsent || parsedAt != null) {
      map['parsed_at'] = Variable<int>(parsedAt);
    }
    return map;
  }

  SmsMessagesCompanion toCompanion(bool nullToAbsent) {
    return SmsMessagesCompanion(
      id: Value(id),
      androidId: androidId == null && nullToAbsent
          ? const Value.absent()
          : Value(androidId),
      address: Value(address),
      body: Value(body),
      receivedAt: Value(receivedAt),
      classifiedAs: Value(classifiedAs),
      parserVersion: parserVersion == null && nullToAbsent
          ? const Value.absent()
          : Value(parserVersion),
      candidateJson: candidateJson == null && nullToAbsent
          ? const Value.absent()
          : Value(candidateJson),
      candidateStatus: Value(candidateStatus),
      linkedTransactionId: linkedTransactionId == null && nullToAbsent
          ? const Value.absent()
          : Value(linkedTransactionId),
      userNote: userNote == null && nullToAbsent
          ? const Value.absent()
          : Value(userNote),
      noteCapturedAt: noteCapturedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(noteCapturedAt),
      locationLat: locationLat == null && nullToAbsent
          ? const Value.absent()
          : Value(locationLat),
      locationLng: locationLng == null && nullToAbsent
          ? const Value.absent()
          : Value(locationLng),
      locationAccuracyM: locationAccuracyM == null && nullToAbsent
          ? const Value.absent()
          : Value(locationAccuracyM),
      locationCapturedAt: locationCapturedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(locationCapturedAt),
      locationPlaceName: locationPlaceName == null && nullToAbsent
          ? const Value.absent()
          : Value(locationPlaceName),
      enrichmentStatus: Value(enrichmentStatus),
      enrichedCandidateJson: enrichedCandidateJson == null && nullToAbsent
          ? const Value.absent()
          : Value(enrichedCandidateJson),
      enrichedAt: enrichedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(enrichedAt),
      stableSmsId: stableSmsId == null && nullToAbsent
          ? const Value.absent()
          : Value(stableSmsId),
      parseAttemptCount: Value(parseAttemptCount),
      nextParseAfter: nextParseAfter == null && nullToAbsent
          ? const Value.absent()
          : Value(nextParseAfter),
      lastParseError: lastParseError == null && nullToAbsent
          ? const Value.absent()
          : Value(lastParseError),
      parsedAt: parsedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(parsedAt),
    );
  }

  factory SmsRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SmsRow(
      id: serializer.fromJson<int>(json['id']),
      androidId: serializer.fromJson<String?>(json['androidId']),
      address: serializer.fromJson<String>(json['address']),
      body: serializer.fromJson<String>(json['body']),
      receivedAt: serializer.fromJson<int>(json['receivedAt']),
      classifiedAs: serializer.fromJson<String>(json['classifiedAs']),
      parserVersion: serializer.fromJson<int?>(json['parserVersion']),
      candidateJson: serializer.fromJson<String?>(json['candidateJson']),
      candidateStatus: serializer.fromJson<String>(json['candidateStatus']),
      linkedTransactionId: serializer.fromJson<String?>(
        json['linkedTransactionId'],
      ),
      userNote: serializer.fromJson<String?>(json['userNote']),
      noteCapturedAt: serializer.fromJson<int?>(json['noteCapturedAt']),
      locationLat: serializer.fromJson<double?>(json['locationLat']),
      locationLng: serializer.fromJson<double?>(json['locationLng']),
      locationAccuracyM: serializer.fromJson<int?>(json['locationAccuracyM']),
      locationCapturedAt: serializer.fromJson<int?>(json['locationCapturedAt']),
      locationPlaceName: serializer.fromJson<String?>(
        json['locationPlaceName'],
      ),
      enrichmentStatus: serializer.fromJson<String>(json['enrichmentStatus']),
      enrichedCandidateJson: serializer.fromJson<String?>(
        json['enrichedCandidateJson'],
      ),
      enrichedAt: serializer.fromJson<int?>(json['enrichedAt']),
      stableSmsId: serializer.fromJson<String?>(json['stableSmsId']),
      parseAttemptCount: serializer.fromJson<int>(json['parseAttemptCount']),
      nextParseAfter: serializer.fromJson<int?>(json['nextParseAfter']),
      lastParseError: serializer.fromJson<String?>(json['lastParseError']),
      parsedAt: serializer.fromJson<int?>(json['parsedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'androidId': serializer.toJson<String?>(androidId),
      'address': serializer.toJson<String>(address),
      'body': serializer.toJson<String>(body),
      'receivedAt': serializer.toJson<int>(receivedAt),
      'classifiedAs': serializer.toJson<String>(classifiedAs),
      'parserVersion': serializer.toJson<int?>(parserVersion),
      'candidateJson': serializer.toJson<String?>(candidateJson),
      'candidateStatus': serializer.toJson<String>(candidateStatus),
      'linkedTransactionId': serializer.toJson<String?>(linkedTransactionId),
      'userNote': serializer.toJson<String?>(userNote),
      'noteCapturedAt': serializer.toJson<int?>(noteCapturedAt),
      'locationLat': serializer.toJson<double?>(locationLat),
      'locationLng': serializer.toJson<double?>(locationLng),
      'locationAccuracyM': serializer.toJson<int?>(locationAccuracyM),
      'locationCapturedAt': serializer.toJson<int?>(locationCapturedAt),
      'locationPlaceName': serializer.toJson<String?>(locationPlaceName),
      'enrichmentStatus': serializer.toJson<String>(enrichmentStatus),
      'enrichedCandidateJson': serializer.toJson<String?>(
        enrichedCandidateJson,
      ),
      'enrichedAt': serializer.toJson<int?>(enrichedAt),
      'stableSmsId': serializer.toJson<String?>(stableSmsId),
      'parseAttemptCount': serializer.toJson<int>(parseAttemptCount),
      'nextParseAfter': serializer.toJson<int?>(nextParseAfter),
      'lastParseError': serializer.toJson<String?>(lastParseError),
      'parsedAt': serializer.toJson<int?>(parsedAt),
    };
  }

  SmsRow copyWith({
    int? id,
    Value<String?> androidId = const Value.absent(),
    String? address,
    String? body,
    int? receivedAt,
    String? classifiedAs,
    Value<int?> parserVersion = const Value.absent(),
    Value<String?> candidateJson = const Value.absent(),
    String? candidateStatus,
    Value<String?> linkedTransactionId = const Value.absent(),
    Value<String?> userNote = const Value.absent(),
    Value<int?> noteCapturedAt = const Value.absent(),
    Value<double?> locationLat = const Value.absent(),
    Value<double?> locationLng = const Value.absent(),
    Value<int?> locationAccuracyM = const Value.absent(),
    Value<int?> locationCapturedAt = const Value.absent(),
    Value<String?> locationPlaceName = const Value.absent(),
    String? enrichmentStatus,
    Value<String?> enrichedCandidateJson = const Value.absent(),
    Value<int?> enrichedAt = const Value.absent(),
    Value<String?> stableSmsId = const Value.absent(),
    int? parseAttemptCount,
    Value<int?> nextParseAfter = const Value.absent(),
    Value<String?> lastParseError = const Value.absent(),
    Value<int?> parsedAt = const Value.absent(),
  }) => SmsRow(
    id: id ?? this.id,
    androidId: androidId.present ? androidId.value : this.androidId,
    address: address ?? this.address,
    body: body ?? this.body,
    receivedAt: receivedAt ?? this.receivedAt,
    classifiedAs: classifiedAs ?? this.classifiedAs,
    parserVersion: parserVersion.present
        ? parserVersion.value
        : this.parserVersion,
    candidateJson: candidateJson.present
        ? candidateJson.value
        : this.candidateJson,
    candidateStatus: candidateStatus ?? this.candidateStatus,
    linkedTransactionId: linkedTransactionId.present
        ? linkedTransactionId.value
        : this.linkedTransactionId,
    userNote: userNote.present ? userNote.value : this.userNote,
    noteCapturedAt: noteCapturedAt.present
        ? noteCapturedAt.value
        : this.noteCapturedAt,
    locationLat: locationLat.present ? locationLat.value : this.locationLat,
    locationLng: locationLng.present ? locationLng.value : this.locationLng,
    locationAccuracyM: locationAccuracyM.present
        ? locationAccuracyM.value
        : this.locationAccuracyM,
    locationCapturedAt: locationCapturedAt.present
        ? locationCapturedAt.value
        : this.locationCapturedAt,
    locationPlaceName: locationPlaceName.present
        ? locationPlaceName.value
        : this.locationPlaceName,
    enrichmentStatus: enrichmentStatus ?? this.enrichmentStatus,
    enrichedCandidateJson: enrichedCandidateJson.present
        ? enrichedCandidateJson.value
        : this.enrichedCandidateJson,
    enrichedAt: enrichedAt.present ? enrichedAt.value : this.enrichedAt,
    stableSmsId: stableSmsId.present ? stableSmsId.value : this.stableSmsId,
    parseAttemptCount: parseAttemptCount ?? this.parseAttemptCount,
    nextParseAfter: nextParseAfter.present
        ? nextParseAfter.value
        : this.nextParseAfter,
    lastParseError: lastParseError.present
        ? lastParseError.value
        : this.lastParseError,
    parsedAt: parsedAt.present ? parsedAt.value : this.parsedAt,
  );
  SmsRow copyWithCompanion(SmsMessagesCompanion data) {
    return SmsRow(
      id: data.id.present ? data.id.value : this.id,
      androidId: data.androidId.present ? data.androidId.value : this.androidId,
      address: data.address.present ? data.address.value : this.address,
      body: data.body.present ? data.body.value : this.body,
      receivedAt: data.receivedAt.present
          ? data.receivedAt.value
          : this.receivedAt,
      classifiedAs: data.classifiedAs.present
          ? data.classifiedAs.value
          : this.classifiedAs,
      parserVersion: data.parserVersion.present
          ? data.parserVersion.value
          : this.parserVersion,
      candidateJson: data.candidateJson.present
          ? data.candidateJson.value
          : this.candidateJson,
      candidateStatus: data.candidateStatus.present
          ? data.candidateStatus.value
          : this.candidateStatus,
      linkedTransactionId: data.linkedTransactionId.present
          ? data.linkedTransactionId.value
          : this.linkedTransactionId,
      userNote: data.userNote.present ? data.userNote.value : this.userNote,
      noteCapturedAt: data.noteCapturedAt.present
          ? data.noteCapturedAt.value
          : this.noteCapturedAt,
      locationLat: data.locationLat.present
          ? data.locationLat.value
          : this.locationLat,
      locationLng: data.locationLng.present
          ? data.locationLng.value
          : this.locationLng,
      locationAccuracyM: data.locationAccuracyM.present
          ? data.locationAccuracyM.value
          : this.locationAccuracyM,
      locationCapturedAt: data.locationCapturedAt.present
          ? data.locationCapturedAt.value
          : this.locationCapturedAt,
      locationPlaceName: data.locationPlaceName.present
          ? data.locationPlaceName.value
          : this.locationPlaceName,
      enrichmentStatus: data.enrichmentStatus.present
          ? data.enrichmentStatus.value
          : this.enrichmentStatus,
      enrichedCandidateJson: data.enrichedCandidateJson.present
          ? data.enrichedCandidateJson.value
          : this.enrichedCandidateJson,
      enrichedAt: data.enrichedAt.present
          ? data.enrichedAt.value
          : this.enrichedAt,
      stableSmsId: data.stableSmsId.present
          ? data.stableSmsId.value
          : this.stableSmsId,
      parseAttemptCount: data.parseAttemptCount.present
          ? data.parseAttemptCount.value
          : this.parseAttemptCount,
      nextParseAfter: data.nextParseAfter.present
          ? data.nextParseAfter.value
          : this.nextParseAfter,
      lastParseError: data.lastParseError.present
          ? data.lastParseError.value
          : this.lastParseError,
      parsedAt: data.parsedAt.present ? data.parsedAt.value : this.parsedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SmsRow(')
          ..write('id: $id, ')
          ..write('androidId: $androidId, ')
          ..write('address: $address, ')
          ..write('body: $body, ')
          ..write('receivedAt: $receivedAt, ')
          ..write('classifiedAs: $classifiedAs, ')
          ..write('parserVersion: $parserVersion, ')
          ..write('candidateJson: $candidateJson, ')
          ..write('candidateStatus: $candidateStatus, ')
          ..write('linkedTransactionId: $linkedTransactionId, ')
          ..write('userNote: $userNote, ')
          ..write('noteCapturedAt: $noteCapturedAt, ')
          ..write('locationLat: $locationLat, ')
          ..write('locationLng: $locationLng, ')
          ..write('locationAccuracyM: $locationAccuracyM, ')
          ..write('locationCapturedAt: $locationCapturedAt, ')
          ..write('locationPlaceName: $locationPlaceName, ')
          ..write('enrichmentStatus: $enrichmentStatus, ')
          ..write('enrichedCandidateJson: $enrichedCandidateJson, ')
          ..write('enrichedAt: $enrichedAt, ')
          ..write('stableSmsId: $stableSmsId, ')
          ..write('parseAttemptCount: $parseAttemptCount, ')
          ..write('nextParseAfter: $nextParseAfter, ')
          ..write('lastParseError: $lastParseError, ')
          ..write('parsedAt: $parsedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hashAll([
    id,
    androidId,
    address,
    body,
    receivedAt,
    classifiedAs,
    parserVersion,
    candidateJson,
    candidateStatus,
    linkedTransactionId,
    userNote,
    noteCapturedAt,
    locationLat,
    locationLng,
    locationAccuracyM,
    locationCapturedAt,
    locationPlaceName,
    enrichmentStatus,
    enrichedCandidateJson,
    enrichedAt,
    stableSmsId,
    parseAttemptCount,
    nextParseAfter,
    lastParseError,
    parsedAt,
  ]);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SmsRow &&
          other.id == this.id &&
          other.androidId == this.androidId &&
          other.address == this.address &&
          other.body == this.body &&
          other.receivedAt == this.receivedAt &&
          other.classifiedAs == this.classifiedAs &&
          other.parserVersion == this.parserVersion &&
          other.candidateJson == this.candidateJson &&
          other.candidateStatus == this.candidateStatus &&
          other.linkedTransactionId == this.linkedTransactionId &&
          other.userNote == this.userNote &&
          other.noteCapturedAt == this.noteCapturedAt &&
          other.locationLat == this.locationLat &&
          other.locationLng == this.locationLng &&
          other.locationAccuracyM == this.locationAccuracyM &&
          other.locationCapturedAt == this.locationCapturedAt &&
          other.locationPlaceName == this.locationPlaceName &&
          other.enrichmentStatus == this.enrichmentStatus &&
          other.enrichedCandidateJson == this.enrichedCandidateJson &&
          other.enrichedAt == this.enrichedAt &&
          other.stableSmsId == this.stableSmsId &&
          other.parseAttemptCount == this.parseAttemptCount &&
          other.nextParseAfter == this.nextParseAfter &&
          other.lastParseError == this.lastParseError &&
          other.parsedAt == this.parsedAt);
}

class SmsMessagesCompanion extends UpdateCompanion<SmsRow> {
  final Value<int> id;
  final Value<String?> androidId;
  final Value<String> address;
  final Value<String> body;
  final Value<int> receivedAt;
  final Value<String> classifiedAs;
  final Value<int?> parserVersion;
  final Value<String?> candidateJson;
  final Value<String> candidateStatus;
  final Value<String?> linkedTransactionId;
  final Value<String?> userNote;
  final Value<int?> noteCapturedAt;
  final Value<double?> locationLat;
  final Value<double?> locationLng;
  final Value<int?> locationAccuracyM;
  final Value<int?> locationCapturedAt;
  final Value<String?> locationPlaceName;
  final Value<String> enrichmentStatus;
  final Value<String?> enrichedCandidateJson;
  final Value<int?> enrichedAt;
  final Value<String?> stableSmsId;
  final Value<int> parseAttemptCount;
  final Value<int?> nextParseAfter;
  final Value<String?> lastParseError;
  final Value<int?> parsedAt;
  const SmsMessagesCompanion({
    this.id = const Value.absent(),
    this.androidId = const Value.absent(),
    this.address = const Value.absent(),
    this.body = const Value.absent(),
    this.receivedAt = const Value.absent(),
    this.classifiedAs = const Value.absent(),
    this.parserVersion = const Value.absent(),
    this.candidateJson = const Value.absent(),
    this.candidateStatus = const Value.absent(),
    this.linkedTransactionId = const Value.absent(),
    this.userNote = const Value.absent(),
    this.noteCapturedAt = const Value.absent(),
    this.locationLat = const Value.absent(),
    this.locationLng = const Value.absent(),
    this.locationAccuracyM = const Value.absent(),
    this.locationCapturedAt = const Value.absent(),
    this.locationPlaceName = const Value.absent(),
    this.enrichmentStatus = const Value.absent(),
    this.enrichedCandidateJson = const Value.absent(),
    this.enrichedAt = const Value.absent(),
    this.stableSmsId = const Value.absent(),
    this.parseAttemptCount = const Value.absent(),
    this.nextParseAfter = const Value.absent(),
    this.lastParseError = const Value.absent(),
    this.parsedAt = const Value.absent(),
  });
  SmsMessagesCompanion.insert({
    this.id = const Value.absent(),
    this.androidId = const Value.absent(),
    required String address,
    required String body,
    required int receivedAt,
    this.classifiedAs = const Value.absent(),
    this.parserVersion = const Value.absent(),
    this.candidateJson = const Value.absent(),
    this.candidateStatus = const Value.absent(),
    this.linkedTransactionId = const Value.absent(),
    this.userNote = const Value.absent(),
    this.noteCapturedAt = const Value.absent(),
    this.locationLat = const Value.absent(),
    this.locationLng = const Value.absent(),
    this.locationAccuracyM = const Value.absent(),
    this.locationCapturedAt = const Value.absent(),
    this.locationPlaceName = const Value.absent(),
    this.enrichmentStatus = const Value.absent(),
    this.enrichedCandidateJson = const Value.absent(),
    this.enrichedAt = const Value.absent(),
    this.stableSmsId = const Value.absent(),
    this.parseAttemptCount = const Value.absent(),
    this.nextParseAfter = const Value.absent(),
    this.lastParseError = const Value.absent(),
    this.parsedAt = const Value.absent(),
  }) : address = Value(address),
       body = Value(body),
       receivedAt = Value(receivedAt);
  static Insertable<SmsRow> custom({
    Expression<int>? id,
    Expression<String>? androidId,
    Expression<String>? address,
    Expression<String>? body,
    Expression<int>? receivedAt,
    Expression<String>? classifiedAs,
    Expression<int>? parserVersion,
    Expression<String>? candidateJson,
    Expression<String>? candidateStatus,
    Expression<String>? linkedTransactionId,
    Expression<String>? userNote,
    Expression<int>? noteCapturedAt,
    Expression<double>? locationLat,
    Expression<double>? locationLng,
    Expression<int>? locationAccuracyM,
    Expression<int>? locationCapturedAt,
    Expression<String>? locationPlaceName,
    Expression<String>? enrichmentStatus,
    Expression<String>? enrichedCandidateJson,
    Expression<int>? enrichedAt,
    Expression<String>? stableSmsId,
    Expression<int>? parseAttemptCount,
    Expression<int>? nextParseAfter,
    Expression<String>? lastParseError,
    Expression<int>? parsedAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (androidId != null) 'android_id': androidId,
      if (address != null) 'address': address,
      if (body != null) 'body': body,
      if (receivedAt != null) 'received_at': receivedAt,
      if (classifiedAs != null) 'classified_as': classifiedAs,
      if (parserVersion != null) 'parser_version': parserVersion,
      if (candidateJson != null) 'candidate_json': candidateJson,
      if (candidateStatus != null) 'candidate_status': candidateStatus,
      if (linkedTransactionId != null)
        'linked_transaction_id': linkedTransactionId,
      if (userNote != null) 'user_note': userNote,
      if (noteCapturedAt != null) 'note_captured_at': noteCapturedAt,
      if (locationLat != null) 'location_lat': locationLat,
      if (locationLng != null) 'location_lng': locationLng,
      if (locationAccuracyM != null) 'location_accuracy_m': locationAccuracyM,
      if (locationCapturedAt != null)
        'location_captured_at': locationCapturedAt,
      if (locationPlaceName != null) 'location_place_name': locationPlaceName,
      if (enrichmentStatus != null) 'enrichment_status': enrichmentStatus,
      if (enrichedCandidateJson != null)
        'enriched_candidate_json': enrichedCandidateJson,
      if (enrichedAt != null) 'enriched_at': enrichedAt,
      if (stableSmsId != null) 'stable_sms_id': stableSmsId,
      if (parseAttemptCount != null) 'parse_attempt_count': parseAttemptCount,
      if (nextParseAfter != null) 'next_parse_after': nextParseAfter,
      if (lastParseError != null) 'last_parse_error': lastParseError,
      if (parsedAt != null) 'parsed_at': parsedAt,
    });
  }

  SmsMessagesCompanion copyWith({
    Value<int>? id,
    Value<String?>? androidId,
    Value<String>? address,
    Value<String>? body,
    Value<int>? receivedAt,
    Value<String>? classifiedAs,
    Value<int?>? parserVersion,
    Value<String?>? candidateJson,
    Value<String>? candidateStatus,
    Value<String?>? linkedTransactionId,
    Value<String?>? userNote,
    Value<int?>? noteCapturedAt,
    Value<double?>? locationLat,
    Value<double?>? locationLng,
    Value<int?>? locationAccuracyM,
    Value<int?>? locationCapturedAt,
    Value<String?>? locationPlaceName,
    Value<String>? enrichmentStatus,
    Value<String?>? enrichedCandidateJson,
    Value<int?>? enrichedAt,
    Value<String?>? stableSmsId,
    Value<int>? parseAttemptCount,
    Value<int?>? nextParseAfter,
    Value<String?>? lastParseError,
    Value<int?>? parsedAt,
  }) {
    return SmsMessagesCompanion(
      id: id ?? this.id,
      androidId: androidId ?? this.androidId,
      address: address ?? this.address,
      body: body ?? this.body,
      receivedAt: receivedAt ?? this.receivedAt,
      classifiedAs: classifiedAs ?? this.classifiedAs,
      parserVersion: parserVersion ?? this.parserVersion,
      candidateJson: candidateJson ?? this.candidateJson,
      candidateStatus: candidateStatus ?? this.candidateStatus,
      linkedTransactionId: linkedTransactionId ?? this.linkedTransactionId,
      userNote: userNote ?? this.userNote,
      noteCapturedAt: noteCapturedAt ?? this.noteCapturedAt,
      locationLat: locationLat ?? this.locationLat,
      locationLng: locationLng ?? this.locationLng,
      locationAccuracyM: locationAccuracyM ?? this.locationAccuracyM,
      locationCapturedAt: locationCapturedAt ?? this.locationCapturedAt,
      locationPlaceName: locationPlaceName ?? this.locationPlaceName,
      enrichmentStatus: enrichmentStatus ?? this.enrichmentStatus,
      enrichedCandidateJson:
          enrichedCandidateJson ?? this.enrichedCandidateJson,
      enrichedAt: enrichedAt ?? this.enrichedAt,
      stableSmsId: stableSmsId ?? this.stableSmsId,
      parseAttemptCount: parseAttemptCount ?? this.parseAttemptCount,
      nextParseAfter: nextParseAfter ?? this.nextParseAfter,
      lastParseError: lastParseError ?? this.lastParseError,
      parsedAt: parsedAt ?? this.parsedAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (androidId.present) {
      map['android_id'] = Variable<String>(androidId.value);
    }
    if (address.present) {
      map['address'] = Variable<String>(address.value);
    }
    if (body.present) {
      map['body'] = Variable<String>(body.value);
    }
    if (receivedAt.present) {
      map['received_at'] = Variable<int>(receivedAt.value);
    }
    if (classifiedAs.present) {
      map['classified_as'] = Variable<String>(classifiedAs.value);
    }
    if (parserVersion.present) {
      map['parser_version'] = Variable<int>(parserVersion.value);
    }
    if (candidateJson.present) {
      map['candidate_json'] = Variable<String>(candidateJson.value);
    }
    if (candidateStatus.present) {
      map['candidate_status'] = Variable<String>(candidateStatus.value);
    }
    if (linkedTransactionId.present) {
      map['linked_transaction_id'] = Variable<String>(
        linkedTransactionId.value,
      );
    }
    if (userNote.present) {
      map['user_note'] = Variable<String>(userNote.value);
    }
    if (noteCapturedAt.present) {
      map['note_captured_at'] = Variable<int>(noteCapturedAt.value);
    }
    if (locationLat.present) {
      map['location_lat'] = Variable<double>(locationLat.value);
    }
    if (locationLng.present) {
      map['location_lng'] = Variable<double>(locationLng.value);
    }
    if (locationAccuracyM.present) {
      map['location_accuracy_m'] = Variable<int>(locationAccuracyM.value);
    }
    if (locationCapturedAt.present) {
      map['location_captured_at'] = Variable<int>(locationCapturedAt.value);
    }
    if (locationPlaceName.present) {
      map['location_place_name'] = Variable<String>(locationPlaceName.value);
    }
    if (enrichmentStatus.present) {
      map['enrichment_status'] = Variable<String>(enrichmentStatus.value);
    }
    if (enrichedCandidateJson.present) {
      map['enriched_candidate_json'] = Variable<String>(
        enrichedCandidateJson.value,
      );
    }
    if (enrichedAt.present) {
      map['enriched_at'] = Variable<int>(enrichedAt.value);
    }
    if (stableSmsId.present) {
      map['stable_sms_id'] = Variable<String>(stableSmsId.value);
    }
    if (parseAttemptCount.present) {
      map['parse_attempt_count'] = Variable<int>(parseAttemptCount.value);
    }
    if (nextParseAfter.present) {
      map['next_parse_after'] = Variable<int>(nextParseAfter.value);
    }
    if (lastParseError.present) {
      map['last_parse_error'] = Variable<String>(lastParseError.value);
    }
    if (parsedAt.present) {
      map['parsed_at'] = Variable<int>(parsedAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SmsMessagesCompanion(')
          ..write('id: $id, ')
          ..write('androidId: $androidId, ')
          ..write('address: $address, ')
          ..write('body: $body, ')
          ..write('receivedAt: $receivedAt, ')
          ..write('classifiedAs: $classifiedAs, ')
          ..write('parserVersion: $parserVersion, ')
          ..write('candidateJson: $candidateJson, ')
          ..write('candidateStatus: $candidateStatus, ')
          ..write('linkedTransactionId: $linkedTransactionId, ')
          ..write('userNote: $userNote, ')
          ..write('noteCapturedAt: $noteCapturedAt, ')
          ..write('locationLat: $locationLat, ')
          ..write('locationLng: $locationLng, ')
          ..write('locationAccuracyM: $locationAccuracyM, ')
          ..write('locationCapturedAt: $locationCapturedAt, ')
          ..write('locationPlaceName: $locationPlaceName, ')
          ..write('enrichmentStatus: $enrichmentStatus, ')
          ..write('enrichedCandidateJson: $enrichedCandidateJson, ')
          ..write('enrichedAt: $enrichedAt, ')
          ..write('stableSmsId: $stableSmsId, ')
          ..write('parseAttemptCount: $parseAttemptCount, ')
          ..write('nextParseAfter: $nextParseAfter, ')
          ..write('lastParseError: $lastParseError, ')
          ..write('parsedAt: $parsedAt')
          ..write(')'))
        .toString();
  }
}

class $SmsParseCacheTable extends SmsParseCache
    with TableInfo<$SmsParseCacheTable, SmsParseCacheRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SmsParseCacheTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _senderSampleMeta = const VerificationMeta(
    'senderSample',
  );
  @override
  late final GeneratedColumn<String> senderSample = GeneratedColumn<String>(
    'sender_sample',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _bodyTemplateMeta = const VerificationMeta(
    'bodyTemplate',
  );
  @override
  late final GeneratedColumn<String> bodyTemplate = GeneratedColumn<String>(
    'body_template',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _payloadJsonMeta = const VerificationMeta(
    'payloadJson',
  );
  @override
  late final GeneratedColumn<String> payloadJson = GeneratedColumn<String>(
    'payload_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _hitsMeta = const VerificationMeta('hits');
  @override
  late final GeneratedColumn<int> hits = GeneratedColumn<int>(
    'hits',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(1),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _lastSeenAtMeta = const VerificationMeta(
    'lastSeenAt',
  );
  @override
  late final GeneratedColumn<int> lastSeenAt = GeneratedColumn<int>(
    'last_seen_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    key,
    senderSample,
    bodyTemplate,
    payloadJson,
    hits,
    createdAt,
    lastSeenAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sms_parse_cache';
  @override
  VerificationContext validateIntegrity(
    Insertable<SmsParseCacheRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('sender_sample')) {
      context.handle(
        _senderSampleMeta,
        senderSample.isAcceptableOrUnknown(
          data['sender_sample']!,
          _senderSampleMeta,
        ),
      );
    }
    if (data.containsKey('body_template')) {
      context.handle(
        _bodyTemplateMeta,
        bodyTemplate.isAcceptableOrUnknown(
          data['body_template']!,
          _bodyTemplateMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_bodyTemplateMeta);
    }
    if (data.containsKey('payload_json')) {
      context.handle(
        _payloadJsonMeta,
        payloadJson.isAcceptableOrUnknown(
          data['payload_json']!,
          _payloadJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_payloadJsonMeta);
    }
    if (data.containsKey('hits')) {
      context.handle(
        _hitsMeta,
        hits.isAcceptableOrUnknown(data['hits']!, _hitsMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('last_seen_at')) {
      context.handle(
        _lastSeenAtMeta,
        lastSeenAt.isAcceptableOrUnknown(
          data['last_seen_at']!,
          _lastSeenAtMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_lastSeenAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  SmsParseCacheRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SmsParseCacheRow(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      senderSample: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sender_sample'],
      ),
      bodyTemplate: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}body_template'],
      )!,
      payloadJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload_json'],
      )!,
      hits: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}hits'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      lastSeenAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}last_seen_at'],
      )!,
    );
  }

  @override
  $SmsParseCacheTable createAlias(String alias) {
    return $SmsParseCacheTable(attachedDatabase, alias);
  }
}

class SmsParseCacheRow extends DataClass
    implements Insertable<SmsParseCacheRow> {
  final String key;
  final String? senderSample;
  final String bodyTemplate;
  final String payloadJson;
  final int hits;
  final int createdAt;
  final int lastSeenAt;
  const SmsParseCacheRow({
    required this.key,
    this.senderSample,
    required this.bodyTemplate,
    required this.payloadJson,
    required this.hits,
    required this.createdAt,
    required this.lastSeenAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    if (!nullToAbsent || senderSample != null) {
      map['sender_sample'] = Variable<String>(senderSample);
    }
    map['body_template'] = Variable<String>(bodyTemplate);
    map['payload_json'] = Variable<String>(payloadJson);
    map['hits'] = Variable<int>(hits);
    map['created_at'] = Variable<int>(createdAt);
    map['last_seen_at'] = Variable<int>(lastSeenAt);
    return map;
  }

  SmsParseCacheCompanion toCompanion(bool nullToAbsent) {
    return SmsParseCacheCompanion(
      key: Value(key),
      senderSample: senderSample == null && nullToAbsent
          ? const Value.absent()
          : Value(senderSample),
      bodyTemplate: Value(bodyTemplate),
      payloadJson: Value(payloadJson),
      hits: Value(hits),
      createdAt: Value(createdAt),
      lastSeenAt: Value(lastSeenAt),
    );
  }

  factory SmsParseCacheRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SmsParseCacheRow(
      key: serializer.fromJson<String>(json['key']),
      senderSample: serializer.fromJson<String?>(json['senderSample']),
      bodyTemplate: serializer.fromJson<String>(json['bodyTemplate']),
      payloadJson: serializer.fromJson<String>(json['payloadJson']),
      hits: serializer.fromJson<int>(json['hits']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      lastSeenAt: serializer.fromJson<int>(json['lastSeenAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'senderSample': serializer.toJson<String?>(senderSample),
      'bodyTemplate': serializer.toJson<String>(bodyTemplate),
      'payloadJson': serializer.toJson<String>(payloadJson),
      'hits': serializer.toJson<int>(hits),
      'createdAt': serializer.toJson<int>(createdAt),
      'lastSeenAt': serializer.toJson<int>(lastSeenAt),
    };
  }

  SmsParseCacheRow copyWith({
    String? key,
    Value<String?> senderSample = const Value.absent(),
    String? bodyTemplate,
    String? payloadJson,
    int? hits,
    int? createdAt,
    int? lastSeenAt,
  }) => SmsParseCacheRow(
    key: key ?? this.key,
    senderSample: senderSample.present ? senderSample.value : this.senderSample,
    bodyTemplate: bodyTemplate ?? this.bodyTemplate,
    payloadJson: payloadJson ?? this.payloadJson,
    hits: hits ?? this.hits,
    createdAt: createdAt ?? this.createdAt,
    lastSeenAt: lastSeenAt ?? this.lastSeenAt,
  );
  SmsParseCacheRow copyWithCompanion(SmsParseCacheCompanion data) {
    return SmsParseCacheRow(
      key: data.key.present ? data.key.value : this.key,
      senderSample: data.senderSample.present
          ? data.senderSample.value
          : this.senderSample,
      bodyTemplate: data.bodyTemplate.present
          ? data.bodyTemplate.value
          : this.bodyTemplate,
      payloadJson: data.payloadJson.present
          ? data.payloadJson.value
          : this.payloadJson,
      hits: data.hits.present ? data.hits.value : this.hits,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      lastSeenAt: data.lastSeenAt.present
          ? data.lastSeenAt.value
          : this.lastSeenAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SmsParseCacheRow(')
          ..write('key: $key, ')
          ..write('senderSample: $senderSample, ')
          ..write('bodyTemplate: $bodyTemplate, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('hits: $hits, ')
          ..write('createdAt: $createdAt, ')
          ..write('lastSeenAt: $lastSeenAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    key,
    senderSample,
    bodyTemplate,
    payloadJson,
    hits,
    createdAt,
    lastSeenAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SmsParseCacheRow &&
          other.key == this.key &&
          other.senderSample == this.senderSample &&
          other.bodyTemplate == this.bodyTemplate &&
          other.payloadJson == this.payloadJson &&
          other.hits == this.hits &&
          other.createdAt == this.createdAt &&
          other.lastSeenAt == this.lastSeenAt);
}

class SmsParseCacheCompanion extends UpdateCompanion<SmsParseCacheRow> {
  final Value<String> key;
  final Value<String?> senderSample;
  final Value<String> bodyTemplate;
  final Value<String> payloadJson;
  final Value<int> hits;
  final Value<int> createdAt;
  final Value<int> lastSeenAt;
  final Value<int> rowid;
  const SmsParseCacheCompanion({
    this.key = const Value.absent(),
    this.senderSample = const Value.absent(),
    this.bodyTemplate = const Value.absent(),
    this.payloadJson = const Value.absent(),
    this.hits = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.lastSeenAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SmsParseCacheCompanion.insert({
    required String key,
    this.senderSample = const Value.absent(),
    required String bodyTemplate,
    required String payloadJson,
    this.hits = const Value.absent(),
    required int createdAt,
    required int lastSeenAt,
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       bodyTemplate = Value(bodyTemplate),
       payloadJson = Value(payloadJson),
       createdAt = Value(createdAt),
       lastSeenAt = Value(lastSeenAt);
  static Insertable<SmsParseCacheRow> custom({
    Expression<String>? key,
    Expression<String>? senderSample,
    Expression<String>? bodyTemplate,
    Expression<String>? payloadJson,
    Expression<int>? hits,
    Expression<int>? createdAt,
    Expression<int>? lastSeenAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (senderSample != null) 'sender_sample': senderSample,
      if (bodyTemplate != null) 'body_template': bodyTemplate,
      if (payloadJson != null) 'payload_json': payloadJson,
      if (hits != null) 'hits': hits,
      if (createdAt != null) 'created_at': createdAt,
      if (lastSeenAt != null) 'last_seen_at': lastSeenAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SmsParseCacheCompanion copyWith({
    Value<String>? key,
    Value<String?>? senderSample,
    Value<String>? bodyTemplate,
    Value<String>? payloadJson,
    Value<int>? hits,
    Value<int>? createdAt,
    Value<int>? lastSeenAt,
    Value<int>? rowid,
  }) {
    return SmsParseCacheCompanion(
      key: key ?? this.key,
      senderSample: senderSample ?? this.senderSample,
      bodyTemplate: bodyTemplate ?? this.bodyTemplate,
      payloadJson: payloadJson ?? this.payloadJson,
      hits: hits ?? this.hits,
      createdAt: createdAt ?? this.createdAt,
      lastSeenAt: lastSeenAt ?? this.lastSeenAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (senderSample.present) {
      map['sender_sample'] = Variable<String>(senderSample.value);
    }
    if (bodyTemplate.present) {
      map['body_template'] = Variable<String>(bodyTemplate.value);
    }
    if (payloadJson.present) {
      map['payload_json'] = Variable<String>(payloadJson.value);
    }
    if (hits.present) {
      map['hits'] = Variable<int>(hits.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (lastSeenAt.present) {
      map['last_seen_at'] = Variable<int>(lastSeenAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SmsParseCacheCompanion(')
          ..write('key: $key, ')
          ..write('senderSample: $senderSample, ')
          ..write('bodyTemplate: $bodyTemplate, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('hits: $hits, ')
          ..write('createdAt: $createdAt, ')
          ..write('lastSeenAt: $lastSeenAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $AppKvTable extends AppKv with TableInfo<$AppKvTable, AppKvRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AppKvTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
    'value',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [key, value];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'app_kv';
  @override
  VerificationContext validateIntegrity(
    Insertable<AppKvRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
        _valueMeta,
        value.isAcceptableOrUnknown(data['value']!, _valueMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  AppKvRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return AppKvRow(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      value: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}value'],
      ),
    );
  }

  @override
  $AppKvTable createAlias(String alias) {
    return $AppKvTable(attachedDatabase, alias);
  }
}

class AppKvRow extends DataClass implements Insertable<AppKvRow> {
  final String key;
  final String? value;
  const AppKvRow({required this.key, this.value});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    if (!nullToAbsent || value != null) {
      map['value'] = Variable<String>(value);
    }
    return map;
  }

  AppKvCompanion toCompanion(bool nullToAbsent) {
    return AppKvCompanion(
      key: Value(key),
      value: value == null && nullToAbsent
          ? const Value.absent()
          : Value(value),
    );
  }

  factory AppKvRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return AppKvRow(
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String?>(json['value']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String?>(value),
    };
  }

  AppKvRow copyWith({
    String? key,
    Value<String?> value = const Value.absent(),
  }) => AppKvRow(
    key: key ?? this.key,
    value: value.present ? value.value : this.value,
  );
  AppKvRow copyWithCompanion(AppKvCompanion data) {
    return AppKvRow(
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
    );
  }

  @override
  String toString() {
    return (StringBuffer('AppKvRow(')
          ..write('key: $key, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, value);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is AppKvRow && other.key == this.key && other.value == this.value);
}

class AppKvCompanion extends UpdateCompanion<AppKvRow> {
  final Value<String> key;
  final Value<String?> value;
  final Value<int> rowid;
  const AppKvCompanion({
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AppKvCompanion.insert({
    required String key,
    this.value = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : key = Value(key);
  static Insertable<AppKvRow> custom({
    Expression<String>? key,
    Expression<String>? value,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AppKvCompanion copyWith({
    Value<String>? key,
    Value<String?>? value,
    Value<int>? rowid,
  }) {
    return AppKvCompanion(
      key: key ?? this.key,
      value: value ?? this.value,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AppKvCompanion(')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $AuditLogTable extends AuditLog
    with TableInfo<$AuditLogTable, AuditLogRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AuditLogTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _atMeta = const VerificationMeta('at');
  @override
  late final GeneratedColumn<int> at = GeneratedColumn<int>(
    'at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _levelMeta = const VerificationMeta('level');
  @override
  late final GeneratedColumn<String> level = GeneratedColumn<String>(
    'level',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _eventMeta = const VerificationMeta('event');
  @override
  late final GeneratedColumn<String> event = GeneratedColumn<String>(
    'event',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _payloadMeta = const VerificationMeta(
    'payload',
  );
  @override
  late final GeneratedColumn<String> payload = GeneratedColumn<String>(
    'payload',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [id, at, level, event, payload];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'audit_log';
  @override
  VerificationContext validateIntegrity(
    Insertable<AuditLogRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('at')) {
      context.handle(_atMeta, at.isAcceptableOrUnknown(data['at']!, _atMeta));
    } else if (isInserting) {
      context.missing(_atMeta);
    }
    if (data.containsKey('level')) {
      context.handle(
        _levelMeta,
        level.isAcceptableOrUnknown(data['level']!, _levelMeta),
      );
    } else if (isInserting) {
      context.missing(_levelMeta);
    }
    if (data.containsKey('event')) {
      context.handle(
        _eventMeta,
        event.isAcceptableOrUnknown(data['event']!, _eventMeta),
      );
    } else if (isInserting) {
      context.missing(_eventMeta);
    }
    if (data.containsKey('payload')) {
      context.handle(
        _payloadMeta,
        payload.isAcceptableOrUnknown(data['payload']!, _payloadMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  AuditLogRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return AuditLogRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      at: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}at'],
      )!,
      level: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}level'],
      )!,
      event: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}event'],
      )!,
      payload: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload'],
      ),
    );
  }

  @override
  $AuditLogTable createAlias(String alias) {
    return $AuditLogTable(attachedDatabase, alias);
  }
}

class AuditLogRow extends DataClass implements Insertable<AuditLogRow> {
  final int id;
  final int at;
  final String level;
  final String event;
  final String? payload;
  const AuditLogRow({
    required this.id,
    required this.at,
    required this.level,
    required this.event,
    this.payload,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['at'] = Variable<int>(at);
    map['level'] = Variable<String>(level);
    map['event'] = Variable<String>(event);
    if (!nullToAbsent || payload != null) {
      map['payload'] = Variable<String>(payload);
    }
    return map;
  }

  AuditLogCompanion toCompanion(bool nullToAbsent) {
    return AuditLogCompanion(
      id: Value(id),
      at: Value(at),
      level: Value(level),
      event: Value(event),
      payload: payload == null && nullToAbsent
          ? const Value.absent()
          : Value(payload),
    );
  }

  factory AuditLogRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return AuditLogRow(
      id: serializer.fromJson<int>(json['id']),
      at: serializer.fromJson<int>(json['at']),
      level: serializer.fromJson<String>(json['level']),
      event: serializer.fromJson<String>(json['event']),
      payload: serializer.fromJson<String?>(json['payload']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'at': serializer.toJson<int>(at),
      'level': serializer.toJson<String>(level),
      'event': serializer.toJson<String>(event),
      'payload': serializer.toJson<String?>(payload),
    };
  }

  AuditLogRow copyWith({
    int? id,
    int? at,
    String? level,
    String? event,
    Value<String?> payload = const Value.absent(),
  }) => AuditLogRow(
    id: id ?? this.id,
    at: at ?? this.at,
    level: level ?? this.level,
    event: event ?? this.event,
    payload: payload.present ? payload.value : this.payload,
  );
  AuditLogRow copyWithCompanion(AuditLogCompanion data) {
    return AuditLogRow(
      id: data.id.present ? data.id.value : this.id,
      at: data.at.present ? data.at.value : this.at,
      level: data.level.present ? data.level.value : this.level,
      event: data.event.present ? data.event.value : this.event,
      payload: data.payload.present ? data.payload.value : this.payload,
    );
  }

  @override
  String toString() {
    return (StringBuffer('AuditLogRow(')
          ..write('id: $id, ')
          ..write('at: $at, ')
          ..write('level: $level, ')
          ..write('event: $event, ')
          ..write('payload: $payload')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, at, level, event, payload);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is AuditLogRow &&
          other.id == this.id &&
          other.at == this.at &&
          other.level == this.level &&
          other.event == this.event &&
          other.payload == this.payload);
}

class AuditLogCompanion extends UpdateCompanion<AuditLogRow> {
  final Value<int> id;
  final Value<int> at;
  final Value<String> level;
  final Value<String> event;
  final Value<String?> payload;
  const AuditLogCompanion({
    this.id = const Value.absent(),
    this.at = const Value.absent(),
    this.level = const Value.absent(),
    this.event = const Value.absent(),
    this.payload = const Value.absent(),
  });
  AuditLogCompanion.insert({
    this.id = const Value.absent(),
    required int at,
    required String level,
    required String event,
    this.payload = const Value.absent(),
  }) : at = Value(at),
       level = Value(level),
       event = Value(event);
  static Insertable<AuditLogRow> custom({
    Expression<int>? id,
    Expression<int>? at,
    Expression<String>? level,
    Expression<String>? event,
    Expression<String>? payload,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (at != null) 'at': at,
      if (level != null) 'level': level,
      if (event != null) 'event': event,
      if (payload != null) 'payload': payload,
    });
  }

  AuditLogCompanion copyWith({
    Value<int>? id,
    Value<int>? at,
    Value<String>? level,
    Value<String>? event,
    Value<String?>? payload,
  }) {
    return AuditLogCompanion(
      id: id ?? this.id,
      at: at ?? this.at,
      level: level ?? this.level,
      event: event ?? this.event,
      payload: payload ?? this.payload,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (at.present) {
      map['at'] = Variable<int>(at.value);
    }
    if (level.present) {
      map['level'] = Variable<String>(level.value);
    }
    if (event.present) {
      map['event'] = Variable<String>(event.value);
    }
    if (payload.present) {
      map['payload'] = Variable<String>(payload.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AuditLogCompanion(')
          ..write('id: $id, ')
          ..write('at: $at, ')
          ..write('level: $level, ')
          ..write('event: $event, ')
          ..write('payload: $payload')
          ..write(')'))
        .toString();
  }
}

class $ChangeLogTable extends ChangeLog
    with TableInfo<$ChangeLogTable, ChangeLogRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ChangeLogTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _atMeta = const VerificationMeta('at');
  @override
  late final GeneratedColumn<int> at = GeneratedColumn<int>(
    'at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _clientChangeIdMeta = const VerificationMeta(
    'clientChangeId',
  );
  @override
  late final GeneratedColumn<String> clientChangeId = GeneratedColumn<String>(
    'client_change_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _resourceMeta = const VerificationMeta(
    'resource',
  );
  @override
  late final GeneratedColumn<String> resource = GeneratedColumn<String>(
    'resource',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _resourceIdMeta = const VerificationMeta(
    'resourceId',
  );
  @override
  late final GeneratedColumn<String> resourceId = GeneratedColumn<String>(
    'resource_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _opMeta = const VerificationMeta('op');
  @override
  late final GeneratedColumn<String> op = GeneratedColumn<String>(
    'op',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _payloadMeta = const VerificationMeta(
    'payload',
  );
  @override
  late final GeneratedColumn<String> payload = GeneratedColumn<String>(
    'payload',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _syncedMeta = const VerificationMeta('synced');
  @override
  late final GeneratedColumn<bool> synced = GeneratedColumn<bool>(
    'synced',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("synced" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    at,
    clientChangeId,
    resource,
    resourceId,
    op,
    payload,
    synced,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'change_log';
  @override
  VerificationContext validateIntegrity(
    Insertable<ChangeLogRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('at')) {
      context.handle(_atMeta, at.isAcceptableOrUnknown(data['at']!, _atMeta));
    } else if (isInserting) {
      context.missing(_atMeta);
    }
    if (data.containsKey('client_change_id')) {
      context.handle(
        _clientChangeIdMeta,
        clientChangeId.isAcceptableOrUnknown(
          data['client_change_id']!,
          _clientChangeIdMeta,
        ),
      );
    }
    if (data.containsKey('resource')) {
      context.handle(
        _resourceMeta,
        resource.isAcceptableOrUnknown(data['resource']!, _resourceMeta),
      );
    } else if (isInserting) {
      context.missing(_resourceMeta);
    }
    if (data.containsKey('resource_id')) {
      context.handle(
        _resourceIdMeta,
        resourceId.isAcceptableOrUnknown(data['resource_id']!, _resourceIdMeta),
      );
    } else if (isInserting) {
      context.missing(_resourceIdMeta);
    }
    if (data.containsKey('op')) {
      context.handle(_opMeta, op.isAcceptableOrUnknown(data['op']!, _opMeta));
    } else if (isInserting) {
      context.missing(_opMeta);
    }
    if (data.containsKey('payload')) {
      context.handle(
        _payloadMeta,
        payload.isAcceptableOrUnknown(data['payload']!, _payloadMeta),
      );
    }
    if (data.containsKey('synced')) {
      context.handle(
        _syncedMeta,
        synced.isAcceptableOrUnknown(data['synced']!, _syncedMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ChangeLogRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ChangeLogRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      at: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}at'],
      )!,
      clientChangeId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}client_change_id'],
      )!,
      resource: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}resource'],
      )!,
      resourceId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}resource_id'],
      )!,
      op: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}op'],
      )!,
      payload: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload'],
      ),
      synced: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}synced'],
      )!,
    );
  }

  @override
  $ChangeLogTable createAlias(String alias) {
    return $ChangeLogTable(attachedDatabase, alias);
  }
}

class ChangeLogRow extends DataClass implements Insertable<ChangeLogRow> {
  final int id;
  final int at;
  final String clientChangeId;
  final String resource;
  final String resourceId;
  final String op;
  final String? payload;
  final bool synced;
  const ChangeLogRow({
    required this.id,
    required this.at,
    required this.clientChangeId,
    required this.resource,
    required this.resourceId,
    required this.op,
    this.payload,
    required this.synced,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['at'] = Variable<int>(at);
    map['client_change_id'] = Variable<String>(clientChangeId);
    map['resource'] = Variable<String>(resource);
    map['resource_id'] = Variable<String>(resourceId);
    map['op'] = Variable<String>(op);
    if (!nullToAbsent || payload != null) {
      map['payload'] = Variable<String>(payload);
    }
    map['synced'] = Variable<bool>(synced);
    return map;
  }

  ChangeLogCompanion toCompanion(bool nullToAbsent) {
    return ChangeLogCompanion(
      id: Value(id),
      at: Value(at),
      clientChangeId: Value(clientChangeId),
      resource: Value(resource),
      resourceId: Value(resourceId),
      op: Value(op),
      payload: payload == null && nullToAbsent
          ? const Value.absent()
          : Value(payload),
      synced: Value(synced),
    );
  }

  factory ChangeLogRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ChangeLogRow(
      id: serializer.fromJson<int>(json['id']),
      at: serializer.fromJson<int>(json['at']),
      clientChangeId: serializer.fromJson<String>(json['clientChangeId']),
      resource: serializer.fromJson<String>(json['resource']),
      resourceId: serializer.fromJson<String>(json['resourceId']),
      op: serializer.fromJson<String>(json['op']),
      payload: serializer.fromJson<String?>(json['payload']),
      synced: serializer.fromJson<bool>(json['synced']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'at': serializer.toJson<int>(at),
      'clientChangeId': serializer.toJson<String>(clientChangeId),
      'resource': serializer.toJson<String>(resource),
      'resourceId': serializer.toJson<String>(resourceId),
      'op': serializer.toJson<String>(op),
      'payload': serializer.toJson<String?>(payload),
      'synced': serializer.toJson<bool>(synced),
    };
  }

  ChangeLogRow copyWith({
    int? id,
    int? at,
    String? clientChangeId,
    String? resource,
    String? resourceId,
    String? op,
    Value<String?> payload = const Value.absent(),
    bool? synced,
  }) => ChangeLogRow(
    id: id ?? this.id,
    at: at ?? this.at,
    clientChangeId: clientChangeId ?? this.clientChangeId,
    resource: resource ?? this.resource,
    resourceId: resourceId ?? this.resourceId,
    op: op ?? this.op,
    payload: payload.present ? payload.value : this.payload,
    synced: synced ?? this.synced,
  );
  ChangeLogRow copyWithCompanion(ChangeLogCompanion data) {
    return ChangeLogRow(
      id: data.id.present ? data.id.value : this.id,
      at: data.at.present ? data.at.value : this.at,
      clientChangeId: data.clientChangeId.present
          ? data.clientChangeId.value
          : this.clientChangeId,
      resource: data.resource.present ? data.resource.value : this.resource,
      resourceId: data.resourceId.present
          ? data.resourceId.value
          : this.resourceId,
      op: data.op.present ? data.op.value : this.op,
      payload: data.payload.present ? data.payload.value : this.payload,
      synced: data.synced.present ? data.synced.value : this.synced,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ChangeLogRow(')
          ..write('id: $id, ')
          ..write('at: $at, ')
          ..write('clientChangeId: $clientChangeId, ')
          ..write('resource: $resource, ')
          ..write('resourceId: $resourceId, ')
          ..write('op: $op, ')
          ..write('payload: $payload, ')
          ..write('synced: $synced')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    at,
    clientChangeId,
    resource,
    resourceId,
    op,
    payload,
    synced,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ChangeLogRow &&
          other.id == this.id &&
          other.at == this.at &&
          other.clientChangeId == this.clientChangeId &&
          other.resource == this.resource &&
          other.resourceId == this.resourceId &&
          other.op == this.op &&
          other.payload == this.payload &&
          other.synced == this.synced);
}

class ChangeLogCompanion extends UpdateCompanion<ChangeLogRow> {
  final Value<int> id;
  final Value<int> at;
  final Value<String> clientChangeId;
  final Value<String> resource;
  final Value<String> resourceId;
  final Value<String> op;
  final Value<String?> payload;
  final Value<bool> synced;
  const ChangeLogCompanion({
    this.id = const Value.absent(),
    this.at = const Value.absent(),
    this.clientChangeId = const Value.absent(),
    this.resource = const Value.absent(),
    this.resourceId = const Value.absent(),
    this.op = const Value.absent(),
    this.payload = const Value.absent(),
    this.synced = const Value.absent(),
  });
  ChangeLogCompanion.insert({
    this.id = const Value.absent(),
    required int at,
    this.clientChangeId = const Value.absent(),
    required String resource,
    required String resourceId,
    required String op,
    this.payload = const Value.absent(),
    this.synced = const Value.absent(),
  }) : at = Value(at),
       resource = Value(resource),
       resourceId = Value(resourceId),
       op = Value(op);
  static Insertable<ChangeLogRow> custom({
    Expression<int>? id,
    Expression<int>? at,
    Expression<String>? clientChangeId,
    Expression<String>? resource,
    Expression<String>? resourceId,
    Expression<String>? op,
    Expression<String>? payload,
    Expression<bool>? synced,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (at != null) 'at': at,
      if (clientChangeId != null) 'client_change_id': clientChangeId,
      if (resource != null) 'resource': resource,
      if (resourceId != null) 'resource_id': resourceId,
      if (op != null) 'op': op,
      if (payload != null) 'payload': payload,
      if (synced != null) 'synced': synced,
    });
  }

  ChangeLogCompanion copyWith({
    Value<int>? id,
    Value<int>? at,
    Value<String>? clientChangeId,
    Value<String>? resource,
    Value<String>? resourceId,
    Value<String>? op,
    Value<String?>? payload,
    Value<bool>? synced,
  }) {
    return ChangeLogCompanion(
      id: id ?? this.id,
      at: at ?? this.at,
      clientChangeId: clientChangeId ?? this.clientChangeId,
      resource: resource ?? this.resource,
      resourceId: resourceId ?? this.resourceId,
      op: op ?? this.op,
      payload: payload ?? this.payload,
      synced: synced ?? this.synced,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (at.present) {
      map['at'] = Variable<int>(at.value);
    }
    if (clientChangeId.present) {
      map['client_change_id'] = Variable<String>(clientChangeId.value);
    }
    if (resource.present) {
      map['resource'] = Variable<String>(resource.value);
    }
    if (resourceId.present) {
      map['resource_id'] = Variable<String>(resourceId.value);
    }
    if (op.present) {
      map['op'] = Variable<String>(op.value);
    }
    if (payload.present) {
      map['payload'] = Variable<String>(payload.value);
    }
    if (synced.present) {
      map['synced'] = Variable<bool>(synced.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ChangeLogCompanion(')
          ..write('id: $id, ')
          ..write('at: $at, ')
          ..write('clientChangeId: $clientChangeId, ')
          ..write('resource: $resource, ')
          ..write('resourceId: $resourceId, ')
          ..write('op: $op, ')
          ..write('payload: $payload, ')
          ..write('synced: $synced')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $AccountsTable accounts = $AccountsTable(this);
  late final $CategoryGroupsTable categoryGroups = $CategoryGroupsTable(this);
  late final $CategoriesTable categories = $CategoriesTable(this);
  late final $PayeesTable payees = $PayeesTable(this);
  late final $TransactionsTable transactions = $TransactionsTable(this);
  late final $TagsTable tags = $TagsTable(this);
  late final $TransactionTagsTable transactionTags = $TransactionTagsTable(
    this,
  );
  late final $RulesTable rules = $RulesTable(this);
  late final $RuleMatchesTable ruleMatches = $RuleMatchesTable(this);
  late final $BudgetsTable budgets = $BudgetsTable(this);
  late final $RecurrencesTable recurrences = $RecurrencesTable(this);
  late final $SmsMessagesTable smsMessages = $SmsMessagesTable(this);
  late final $SmsParseCacheTable smsParseCache = $SmsParseCacheTable(this);
  late final $AppKvTable appKv = $AppKvTable(this);
  late final $AuditLogTable auditLog = $AuditLogTable(this);
  late final $ChangeLogTable changeLog = $ChangeLogTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    accounts,
    categoryGroups,
    categories,
    payees,
    transactions,
    tags,
    transactionTags,
    rules,
    ruleMatches,
    budgets,
    recurrences,
    smsMessages,
    smsParseCache,
    appKv,
    auditLog,
    changeLog,
  ];
}

typedef $$AccountsTableCreateCompanionBuilder =
    AccountsCompanion Function({
      required String id,
      required String name,
      Value<String> kind,
      Value<int> openingBalanceCents,
      Value<int?> reconciledBalanceCents,
      Value<int?> reconciledAt,
      Value<bool> onBudget,
      Value<bool> archived,
      Value<int> sortOrder,
      required int createdAt,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$AccountsTableUpdateCompanionBuilder =
    AccountsCompanion Function({
      Value<String> id,
      Value<String> name,
      Value<String> kind,
      Value<int> openingBalanceCents,
      Value<int?> reconciledBalanceCents,
      Value<int?> reconciledAt,
      Value<bool> onBudget,
      Value<bool> archived,
      Value<int> sortOrder,
      Value<int> createdAt,
      Value<int> updatedAt,
      Value<int> rowid,
    });

class $$AccountsTableFilterComposer
    extends Composer<_$AppDatabase, $AccountsTable> {
  $$AccountsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get openingBalanceCents => $composableBuilder(
    column: $table.openingBalanceCents,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get reconciledBalanceCents => $composableBuilder(
    column: $table.reconciledBalanceCents,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get reconciledAt => $composableBuilder(
    column: $table.reconciledAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get onBudget => $composableBuilder(
    column: $table.onBudget,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get archived => $composableBuilder(
    column: $table.archived,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$AccountsTableOrderingComposer
    extends Composer<_$AppDatabase, $AccountsTable> {
  $$AccountsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get openingBalanceCents => $composableBuilder(
    column: $table.openingBalanceCents,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get reconciledBalanceCents => $composableBuilder(
    column: $table.reconciledBalanceCents,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get reconciledAt => $composableBuilder(
    column: $table.reconciledAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get onBudget => $composableBuilder(
    column: $table.onBudget,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get archived => $composableBuilder(
    column: $table.archived,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$AccountsTableAnnotationComposer
    extends Composer<_$AppDatabase, $AccountsTable> {
  $$AccountsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<int> get openingBalanceCents => $composableBuilder(
    column: $table.openingBalanceCents,
    builder: (column) => column,
  );

  GeneratedColumn<int> get reconciledBalanceCents => $composableBuilder(
    column: $table.reconciledBalanceCents,
    builder: (column) => column,
  );

  GeneratedColumn<int> get reconciledAt => $composableBuilder(
    column: $table.reconciledAt,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get onBudget =>
      $composableBuilder(column: $table.onBudget, builder: (column) => column);

  GeneratedColumn<bool> get archived =>
      $composableBuilder(column: $table.archived, builder: (column) => column);

  GeneratedColumn<int> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$AccountsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $AccountsTable,
          AccountRow,
          $$AccountsTableFilterComposer,
          $$AccountsTableOrderingComposer,
          $$AccountsTableAnnotationComposer,
          $$AccountsTableCreateCompanionBuilder,
          $$AccountsTableUpdateCompanionBuilder,
          (
            AccountRow,
            BaseReferences<_$AppDatabase, $AccountsTable, AccountRow>,
          ),
          AccountRow,
          PrefetchHooks Function()
        > {
  $$AccountsTableTableManager(_$AppDatabase db, $AccountsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AccountsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AccountsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AccountsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> kind = const Value.absent(),
                Value<int> openingBalanceCents = const Value.absent(),
                Value<int?> reconciledBalanceCents = const Value.absent(),
                Value<int?> reconciledAt = const Value.absent(),
                Value<bool> onBudget = const Value.absent(),
                Value<bool> archived = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => AccountsCompanion(
                id: id,
                name: name,
                kind: kind,
                openingBalanceCents: openingBalanceCents,
                reconciledBalanceCents: reconciledBalanceCents,
                reconciledAt: reconciledAt,
                onBudget: onBudget,
                archived: archived,
                sortOrder: sortOrder,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String name,
                Value<String> kind = const Value.absent(),
                Value<int> openingBalanceCents = const Value.absent(),
                Value<int?> reconciledBalanceCents = const Value.absent(),
                Value<int?> reconciledAt = const Value.absent(),
                Value<bool> onBudget = const Value.absent(),
                Value<bool> archived = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                required int createdAt,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => AccountsCompanion.insert(
                id: id,
                name: name,
                kind: kind,
                openingBalanceCents: openingBalanceCents,
                reconciledBalanceCents: reconciledBalanceCents,
                reconciledAt: reconciledAt,
                onBudget: onBudget,
                archived: archived,
                sortOrder: sortOrder,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$AccountsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $AccountsTable,
      AccountRow,
      $$AccountsTableFilterComposer,
      $$AccountsTableOrderingComposer,
      $$AccountsTableAnnotationComposer,
      $$AccountsTableCreateCompanionBuilder,
      $$AccountsTableUpdateCompanionBuilder,
      (AccountRow, BaseReferences<_$AppDatabase, $AccountsTable, AccountRow>),
      AccountRow,
      PrefetchHooks Function()
    >;
typedef $$CategoryGroupsTableCreateCompanionBuilder =
    CategoryGroupsCompanion Function({
      required String id,
      required String name,
      Value<bool> isIncome,
      Value<int> sortOrder,
      Value<int> rowid,
    });
typedef $$CategoryGroupsTableUpdateCompanionBuilder =
    CategoryGroupsCompanion Function({
      Value<String> id,
      Value<String> name,
      Value<bool> isIncome,
      Value<int> sortOrder,
      Value<int> rowid,
    });

class $$CategoryGroupsTableFilterComposer
    extends Composer<_$AppDatabase, $CategoryGroupsTable> {
  $$CategoryGroupsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isIncome => $composableBuilder(
    column: $table.isIncome,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CategoryGroupsTableOrderingComposer
    extends Composer<_$AppDatabase, $CategoryGroupsTable> {
  $$CategoryGroupsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isIncome => $composableBuilder(
    column: $table.isIncome,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CategoryGroupsTableAnnotationComposer
    extends Composer<_$AppDatabase, $CategoryGroupsTable> {
  $$CategoryGroupsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<bool> get isIncome =>
      $composableBuilder(column: $table.isIncome, builder: (column) => column);

  GeneratedColumn<int> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => column);
}

class $$CategoryGroupsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CategoryGroupsTable,
          CategoryGroupRow,
          $$CategoryGroupsTableFilterComposer,
          $$CategoryGroupsTableOrderingComposer,
          $$CategoryGroupsTableAnnotationComposer,
          $$CategoryGroupsTableCreateCompanionBuilder,
          $$CategoryGroupsTableUpdateCompanionBuilder,
          (
            CategoryGroupRow,
            BaseReferences<
              _$AppDatabase,
              $CategoryGroupsTable,
              CategoryGroupRow
            >,
          ),
          CategoryGroupRow,
          PrefetchHooks Function()
        > {
  $$CategoryGroupsTableTableManager(
    _$AppDatabase db,
    $CategoryGroupsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CategoryGroupsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CategoryGroupsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CategoryGroupsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<bool> isIncome = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CategoryGroupsCompanion(
                id: id,
                name: name,
                isIncome: isIncome,
                sortOrder: sortOrder,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String name,
                Value<bool> isIncome = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CategoryGroupsCompanion.insert(
                id: id,
                name: name,
                isIncome: isIncome,
                sortOrder: sortOrder,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CategoryGroupsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CategoryGroupsTable,
      CategoryGroupRow,
      $$CategoryGroupsTableFilterComposer,
      $$CategoryGroupsTableOrderingComposer,
      $$CategoryGroupsTableAnnotationComposer,
      $$CategoryGroupsTableCreateCompanionBuilder,
      $$CategoryGroupsTableUpdateCompanionBuilder,
      (
        CategoryGroupRow,
        BaseReferences<_$AppDatabase, $CategoryGroupsTable, CategoryGroupRow>,
      ),
      CategoryGroupRow,
      PrefetchHooks Function()
    >;
typedef $$CategoriesTableCreateCompanionBuilder =
    CategoriesCompanion Function({
      required String id,
      required String name,
      required String groupId,
      Value<String?> parentId,
      Value<int?> color,
      Value<String?> icon,
      Value<bool> hidden,
      Value<int> sortOrder,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$CategoriesTableUpdateCompanionBuilder =
    CategoriesCompanion Function({
      Value<String> id,
      Value<String> name,
      Value<String> groupId,
      Value<String?> parentId,
      Value<int?> color,
      Value<String?> icon,
      Value<bool> hidden,
      Value<int> sortOrder,
      Value<int> updatedAt,
      Value<int> rowid,
    });

class $$CategoriesTableFilterComposer
    extends Composer<_$AppDatabase, $CategoriesTable> {
  $$CategoriesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get groupId => $composableBuilder(
    column: $table.groupId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get parentId => $composableBuilder(
    column: $table.parentId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get color => $composableBuilder(
    column: $table.color,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get icon => $composableBuilder(
    column: $table.icon,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get hidden => $composableBuilder(
    column: $table.hidden,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CategoriesTableOrderingComposer
    extends Composer<_$AppDatabase, $CategoriesTable> {
  $$CategoriesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get groupId => $composableBuilder(
    column: $table.groupId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get parentId => $composableBuilder(
    column: $table.parentId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get color => $composableBuilder(
    column: $table.color,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get icon => $composableBuilder(
    column: $table.icon,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get hidden => $composableBuilder(
    column: $table.hidden,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CategoriesTableAnnotationComposer
    extends Composer<_$AppDatabase, $CategoriesTable> {
  $$CategoriesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get groupId =>
      $composableBuilder(column: $table.groupId, builder: (column) => column);

  GeneratedColumn<String> get parentId =>
      $composableBuilder(column: $table.parentId, builder: (column) => column);

  GeneratedColumn<int> get color =>
      $composableBuilder(column: $table.color, builder: (column) => column);

  GeneratedColumn<String> get icon =>
      $composableBuilder(column: $table.icon, builder: (column) => column);

  GeneratedColumn<bool> get hidden =>
      $composableBuilder(column: $table.hidden, builder: (column) => column);

  GeneratedColumn<int> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$CategoriesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CategoriesTable,
          CategoryRow,
          $$CategoriesTableFilterComposer,
          $$CategoriesTableOrderingComposer,
          $$CategoriesTableAnnotationComposer,
          $$CategoriesTableCreateCompanionBuilder,
          $$CategoriesTableUpdateCompanionBuilder,
          (
            CategoryRow,
            BaseReferences<_$AppDatabase, $CategoriesTable, CategoryRow>,
          ),
          CategoryRow,
          PrefetchHooks Function()
        > {
  $$CategoriesTableTableManager(_$AppDatabase db, $CategoriesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CategoriesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CategoriesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CategoriesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> groupId = const Value.absent(),
                Value<String?> parentId = const Value.absent(),
                Value<int?> color = const Value.absent(),
                Value<String?> icon = const Value.absent(),
                Value<bool> hidden = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CategoriesCompanion(
                id: id,
                name: name,
                groupId: groupId,
                parentId: parentId,
                color: color,
                icon: icon,
                hidden: hidden,
                sortOrder: sortOrder,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String name,
                required String groupId,
                Value<String?> parentId = const Value.absent(),
                Value<int?> color = const Value.absent(),
                Value<String?> icon = const Value.absent(),
                Value<bool> hidden = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => CategoriesCompanion.insert(
                id: id,
                name: name,
                groupId: groupId,
                parentId: parentId,
                color: color,
                icon: icon,
                hidden: hidden,
                sortOrder: sortOrder,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CategoriesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CategoriesTable,
      CategoryRow,
      $$CategoriesTableFilterComposer,
      $$CategoriesTableOrderingComposer,
      $$CategoriesTableAnnotationComposer,
      $$CategoriesTableCreateCompanionBuilder,
      $$CategoriesTableUpdateCompanionBuilder,
      (
        CategoryRow,
        BaseReferences<_$AppDatabase, $CategoriesTable, CategoryRow>,
      ),
      CategoryRow,
      PrefetchHooks Function()
    >;
typedef $$PayeesTableCreateCompanionBuilder =
    PayeesCompanion Function({
      required String id,
      required String name,
      Value<int> useCount,
      Value<bool> learnCategories,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$PayeesTableUpdateCompanionBuilder =
    PayeesCompanion Function({
      Value<String> id,
      Value<String> name,
      Value<int> useCount,
      Value<bool> learnCategories,
      Value<int> updatedAt,
      Value<int> rowid,
    });

class $$PayeesTableFilterComposer
    extends Composer<_$AppDatabase, $PayeesTable> {
  $$PayeesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get useCount => $composableBuilder(
    column: $table.useCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get learnCategories => $composableBuilder(
    column: $table.learnCategories,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$PayeesTableOrderingComposer
    extends Composer<_$AppDatabase, $PayeesTable> {
  $$PayeesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get useCount => $composableBuilder(
    column: $table.useCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get learnCategories => $composableBuilder(
    column: $table.learnCategories,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$PayeesTableAnnotationComposer
    extends Composer<_$AppDatabase, $PayeesTable> {
  $$PayeesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<int> get useCount =>
      $composableBuilder(column: $table.useCount, builder: (column) => column);

  GeneratedColumn<bool> get learnCategories => $composableBuilder(
    column: $table.learnCategories,
    builder: (column) => column,
  );

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$PayeesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $PayeesTable,
          PayeeRow,
          $$PayeesTableFilterComposer,
          $$PayeesTableOrderingComposer,
          $$PayeesTableAnnotationComposer,
          $$PayeesTableCreateCompanionBuilder,
          $$PayeesTableUpdateCompanionBuilder,
          (PayeeRow, BaseReferences<_$AppDatabase, $PayeesTable, PayeeRow>),
          PayeeRow,
          PrefetchHooks Function()
        > {
  $$PayeesTableTableManager(_$AppDatabase db, $PayeesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$PayeesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$PayeesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$PayeesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<int> useCount = const Value.absent(),
                Value<bool> learnCategories = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PayeesCompanion(
                id: id,
                name: name,
                useCount: useCount,
                learnCategories: learnCategories,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String name,
                Value<int> useCount = const Value.absent(),
                Value<bool> learnCategories = const Value.absent(),
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => PayeesCompanion.insert(
                id: id,
                name: name,
                useCount: useCount,
                learnCategories: learnCategories,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$PayeesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $PayeesTable,
      PayeeRow,
      $$PayeesTableFilterComposer,
      $$PayeesTableOrderingComposer,
      $$PayeesTableAnnotationComposer,
      $$PayeesTableCreateCompanionBuilder,
      $$PayeesTableUpdateCompanionBuilder,
      (PayeeRow, BaseReferences<_$AppDatabase, $PayeesTable, PayeeRow>),
      PayeeRow,
      PrefetchHooks Function()
    >;
typedef $$TransactionsTableCreateCompanionBuilder =
    TransactionsCompanion Function({
      required String id,
      required String accountId,
      Value<String?> categoryId,
      Value<String?> payeeId,
      Value<String?> payeeName,
      required int amountCents,
      required String date,
      Value<String?> notes,
      Value<double?> latitude,
      Value<double?> longitude,
      Value<String?> locationName,
      Value<bool> cleared,
      Value<bool> reconciled,
      Value<String> origin,
      Value<String?> originRef,
      Value<String?> importedId,
      Value<String?> transferAccountId,
      Value<String?> transferGroupId,
      Value<String?> parentId,
      Value<int?> splitTotalCents,
      Value<String?> groupParentId,
      Value<bool> isGroupParent,
      Value<int?> originalAmountCents,
      Value<String?> originalCurrency,
      required int createdAt,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$TransactionsTableUpdateCompanionBuilder =
    TransactionsCompanion Function({
      Value<String> id,
      Value<String> accountId,
      Value<String?> categoryId,
      Value<String?> payeeId,
      Value<String?> payeeName,
      Value<int> amountCents,
      Value<String> date,
      Value<String?> notes,
      Value<double?> latitude,
      Value<double?> longitude,
      Value<String?> locationName,
      Value<bool> cleared,
      Value<bool> reconciled,
      Value<String> origin,
      Value<String?> originRef,
      Value<String?> importedId,
      Value<String?> transferAccountId,
      Value<String?> transferGroupId,
      Value<String?> parentId,
      Value<int?> splitTotalCents,
      Value<String?> groupParentId,
      Value<bool> isGroupParent,
      Value<int?> originalAmountCents,
      Value<String?> originalCurrency,
      Value<int> createdAt,
      Value<int> updatedAt,
      Value<int> rowid,
    });

class $$TransactionsTableFilterComposer
    extends Composer<_$AppDatabase, $TransactionsTable> {
  $$TransactionsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get accountId => $composableBuilder(
    column: $table.accountId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get categoryId => $composableBuilder(
    column: $table.categoryId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payeeId => $composableBuilder(
    column: $table.payeeId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payeeName => $composableBuilder(
    column: $table.payeeName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get amountCents => $composableBuilder(
    column: $table.amountCents,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get date => $composableBuilder(
    column: $table.date,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get latitude => $composableBuilder(
    column: $table.latitude,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get longitude => $composableBuilder(
    column: $table.longitude,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get locationName => $composableBuilder(
    column: $table.locationName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get cleared => $composableBuilder(
    column: $table.cleared,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get reconciled => $composableBuilder(
    column: $table.reconciled,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get origin => $composableBuilder(
    column: $table.origin,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get originRef => $composableBuilder(
    column: $table.originRef,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get importedId => $composableBuilder(
    column: $table.importedId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get transferAccountId => $composableBuilder(
    column: $table.transferAccountId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get transferGroupId => $composableBuilder(
    column: $table.transferGroupId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get parentId => $composableBuilder(
    column: $table.parentId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get splitTotalCents => $composableBuilder(
    column: $table.splitTotalCents,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get groupParentId => $composableBuilder(
    column: $table.groupParentId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isGroupParent => $composableBuilder(
    column: $table.isGroupParent,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get originalAmountCents => $composableBuilder(
    column: $table.originalAmountCents,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get originalCurrency => $composableBuilder(
    column: $table.originalCurrency,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$TransactionsTableOrderingComposer
    extends Composer<_$AppDatabase, $TransactionsTable> {
  $$TransactionsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get accountId => $composableBuilder(
    column: $table.accountId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get categoryId => $composableBuilder(
    column: $table.categoryId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payeeId => $composableBuilder(
    column: $table.payeeId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payeeName => $composableBuilder(
    column: $table.payeeName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get amountCents => $composableBuilder(
    column: $table.amountCents,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get date => $composableBuilder(
    column: $table.date,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get latitude => $composableBuilder(
    column: $table.latitude,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get longitude => $composableBuilder(
    column: $table.longitude,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get locationName => $composableBuilder(
    column: $table.locationName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get cleared => $composableBuilder(
    column: $table.cleared,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get reconciled => $composableBuilder(
    column: $table.reconciled,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get origin => $composableBuilder(
    column: $table.origin,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get originRef => $composableBuilder(
    column: $table.originRef,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get importedId => $composableBuilder(
    column: $table.importedId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get transferAccountId => $composableBuilder(
    column: $table.transferAccountId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get transferGroupId => $composableBuilder(
    column: $table.transferGroupId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get parentId => $composableBuilder(
    column: $table.parentId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get splitTotalCents => $composableBuilder(
    column: $table.splitTotalCents,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get groupParentId => $composableBuilder(
    column: $table.groupParentId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isGroupParent => $composableBuilder(
    column: $table.isGroupParent,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get originalAmountCents => $composableBuilder(
    column: $table.originalAmountCents,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get originalCurrency => $composableBuilder(
    column: $table.originalCurrency,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$TransactionsTableAnnotationComposer
    extends Composer<_$AppDatabase, $TransactionsTable> {
  $$TransactionsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get accountId =>
      $composableBuilder(column: $table.accountId, builder: (column) => column);

  GeneratedColumn<String> get categoryId => $composableBuilder(
    column: $table.categoryId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get payeeId =>
      $composableBuilder(column: $table.payeeId, builder: (column) => column);

  GeneratedColumn<String> get payeeName =>
      $composableBuilder(column: $table.payeeName, builder: (column) => column);

  GeneratedColumn<int> get amountCents => $composableBuilder(
    column: $table.amountCents,
    builder: (column) => column,
  );

  GeneratedColumn<String> get date =>
      $composableBuilder(column: $table.date, builder: (column) => column);

  GeneratedColumn<String> get notes =>
      $composableBuilder(column: $table.notes, builder: (column) => column);

  GeneratedColumn<double> get latitude =>
      $composableBuilder(column: $table.latitude, builder: (column) => column);

  GeneratedColumn<double> get longitude =>
      $composableBuilder(column: $table.longitude, builder: (column) => column);

  GeneratedColumn<String> get locationName => $composableBuilder(
    column: $table.locationName,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get cleared =>
      $composableBuilder(column: $table.cleared, builder: (column) => column);

  GeneratedColumn<bool> get reconciled => $composableBuilder(
    column: $table.reconciled,
    builder: (column) => column,
  );

  GeneratedColumn<String> get origin =>
      $composableBuilder(column: $table.origin, builder: (column) => column);

  GeneratedColumn<String> get originRef =>
      $composableBuilder(column: $table.originRef, builder: (column) => column);

  GeneratedColumn<String> get importedId => $composableBuilder(
    column: $table.importedId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get transferAccountId => $composableBuilder(
    column: $table.transferAccountId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get transferGroupId => $composableBuilder(
    column: $table.transferGroupId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get parentId =>
      $composableBuilder(column: $table.parentId, builder: (column) => column);

  GeneratedColumn<int> get splitTotalCents => $composableBuilder(
    column: $table.splitTotalCents,
    builder: (column) => column,
  );

  GeneratedColumn<String> get groupParentId => $composableBuilder(
    column: $table.groupParentId,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get isGroupParent => $composableBuilder(
    column: $table.isGroupParent,
    builder: (column) => column,
  );

  GeneratedColumn<int> get originalAmountCents => $composableBuilder(
    column: $table.originalAmountCents,
    builder: (column) => column,
  );

  GeneratedColumn<String> get originalCurrency => $composableBuilder(
    column: $table.originalCurrency,
    builder: (column) => column,
  );

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$TransactionsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $TransactionsTable,
          TransactionRow,
          $$TransactionsTableFilterComposer,
          $$TransactionsTableOrderingComposer,
          $$TransactionsTableAnnotationComposer,
          $$TransactionsTableCreateCompanionBuilder,
          $$TransactionsTableUpdateCompanionBuilder,
          (
            TransactionRow,
            BaseReferences<_$AppDatabase, $TransactionsTable, TransactionRow>,
          ),
          TransactionRow,
          PrefetchHooks Function()
        > {
  $$TransactionsTableTableManager(_$AppDatabase db, $TransactionsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$TransactionsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$TransactionsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$TransactionsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> accountId = const Value.absent(),
                Value<String?> categoryId = const Value.absent(),
                Value<String?> payeeId = const Value.absent(),
                Value<String?> payeeName = const Value.absent(),
                Value<int> amountCents = const Value.absent(),
                Value<String> date = const Value.absent(),
                Value<String?> notes = const Value.absent(),
                Value<double?> latitude = const Value.absent(),
                Value<double?> longitude = const Value.absent(),
                Value<String?> locationName = const Value.absent(),
                Value<bool> cleared = const Value.absent(),
                Value<bool> reconciled = const Value.absent(),
                Value<String> origin = const Value.absent(),
                Value<String?> originRef = const Value.absent(),
                Value<String?> importedId = const Value.absent(),
                Value<String?> transferAccountId = const Value.absent(),
                Value<String?> transferGroupId = const Value.absent(),
                Value<String?> parentId = const Value.absent(),
                Value<int?> splitTotalCents = const Value.absent(),
                Value<String?> groupParentId = const Value.absent(),
                Value<bool> isGroupParent = const Value.absent(),
                Value<int?> originalAmountCents = const Value.absent(),
                Value<String?> originalCurrency = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => TransactionsCompanion(
                id: id,
                accountId: accountId,
                categoryId: categoryId,
                payeeId: payeeId,
                payeeName: payeeName,
                amountCents: amountCents,
                date: date,
                notes: notes,
                latitude: latitude,
                longitude: longitude,
                locationName: locationName,
                cleared: cleared,
                reconciled: reconciled,
                origin: origin,
                originRef: originRef,
                importedId: importedId,
                transferAccountId: transferAccountId,
                transferGroupId: transferGroupId,
                parentId: parentId,
                splitTotalCents: splitTotalCents,
                groupParentId: groupParentId,
                isGroupParent: isGroupParent,
                originalAmountCents: originalAmountCents,
                originalCurrency: originalCurrency,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String accountId,
                Value<String?> categoryId = const Value.absent(),
                Value<String?> payeeId = const Value.absent(),
                Value<String?> payeeName = const Value.absent(),
                required int amountCents,
                required String date,
                Value<String?> notes = const Value.absent(),
                Value<double?> latitude = const Value.absent(),
                Value<double?> longitude = const Value.absent(),
                Value<String?> locationName = const Value.absent(),
                Value<bool> cleared = const Value.absent(),
                Value<bool> reconciled = const Value.absent(),
                Value<String> origin = const Value.absent(),
                Value<String?> originRef = const Value.absent(),
                Value<String?> importedId = const Value.absent(),
                Value<String?> transferAccountId = const Value.absent(),
                Value<String?> transferGroupId = const Value.absent(),
                Value<String?> parentId = const Value.absent(),
                Value<int?> splitTotalCents = const Value.absent(),
                Value<String?> groupParentId = const Value.absent(),
                Value<bool> isGroupParent = const Value.absent(),
                Value<int?> originalAmountCents = const Value.absent(),
                Value<String?> originalCurrency = const Value.absent(),
                required int createdAt,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => TransactionsCompanion.insert(
                id: id,
                accountId: accountId,
                categoryId: categoryId,
                payeeId: payeeId,
                payeeName: payeeName,
                amountCents: amountCents,
                date: date,
                notes: notes,
                latitude: latitude,
                longitude: longitude,
                locationName: locationName,
                cleared: cleared,
                reconciled: reconciled,
                origin: origin,
                originRef: originRef,
                importedId: importedId,
                transferAccountId: transferAccountId,
                transferGroupId: transferGroupId,
                parentId: parentId,
                splitTotalCents: splitTotalCents,
                groupParentId: groupParentId,
                isGroupParent: isGroupParent,
                originalAmountCents: originalAmountCents,
                originalCurrency: originalCurrency,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$TransactionsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $TransactionsTable,
      TransactionRow,
      $$TransactionsTableFilterComposer,
      $$TransactionsTableOrderingComposer,
      $$TransactionsTableAnnotationComposer,
      $$TransactionsTableCreateCompanionBuilder,
      $$TransactionsTableUpdateCompanionBuilder,
      (
        TransactionRow,
        BaseReferences<_$AppDatabase, $TransactionsTable, TransactionRow>,
      ),
      TransactionRow,
      PrefetchHooks Function()
    >;
typedef $$TagsTableCreateCompanionBuilder =
    TagsCompanion Function({
      required String id,
      required String name,
      Value<int?> color,
      Value<bool> archived,
      required int createdAt,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$TagsTableUpdateCompanionBuilder =
    TagsCompanion Function({
      Value<String> id,
      Value<String> name,
      Value<int?> color,
      Value<bool> archived,
      Value<int> createdAt,
      Value<int> updatedAt,
      Value<int> rowid,
    });

class $$TagsTableFilterComposer extends Composer<_$AppDatabase, $TagsTable> {
  $$TagsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get color => $composableBuilder(
    column: $table.color,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get archived => $composableBuilder(
    column: $table.archived,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$TagsTableOrderingComposer extends Composer<_$AppDatabase, $TagsTable> {
  $$TagsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get color => $composableBuilder(
    column: $table.color,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get archived => $composableBuilder(
    column: $table.archived,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$TagsTableAnnotationComposer
    extends Composer<_$AppDatabase, $TagsTable> {
  $$TagsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<int> get color =>
      $composableBuilder(column: $table.color, builder: (column) => column);

  GeneratedColumn<bool> get archived =>
      $composableBuilder(column: $table.archived, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$TagsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $TagsTable,
          TagRow,
          $$TagsTableFilterComposer,
          $$TagsTableOrderingComposer,
          $$TagsTableAnnotationComposer,
          $$TagsTableCreateCompanionBuilder,
          $$TagsTableUpdateCompanionBuilder,
          (TagRow, BaseReferences<_$AppDatabase, $TagsTable, TagRow>),
          TagRow,
          PrefetchHooks Function()
        > {
  $$TagsTableTableManager(_$AppDatabase db, $TagsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$TagsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$TagsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$TagsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<int?> color = const Value.absent(),
                Value<bool> archived = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => TagsCompanion(
                id: id,
                name: name,
                color: color,
                archived: archived,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String name,
                Value<int?> color = const Value.absent(),
                Value<bool> archived = const Value.absent(),
                required int createdAt,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => TagsCompanion.insert(
                id: id,
                name: name,
                color: color,
                archived: archived,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$TagsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $TagsTable,
      TagRow,
      $$TagsTableFilterComposer,
      $$TagsTableOrderingComposer,
      $$TagsTableAnnotationComposer,
      $$TagsTableCreateCompanionBuilder,
      $$TagsTableUpdateCompanionBuilder,
      (TagRow, BaseReferences<_$AppDatabase, $TagsTable, TagRow>),
      TagRow,
      PrefetchHooks Function()
    >;
typedef $$TransactionTagsTableCreateCompanionBuilder =
    TransactionTagsCompanion Function({
      required String id,
      required String transactionId,
      required String tagId,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$TransactionTagsTableUpdateCompanionBuilder =
    TransactionTagsCompanion Function({
      Value<String> id,
      Value<String> transactionId,
      Value<String> tagId,
      Value<int> updatedAt,
      Value<int> rowid,
    });

class $$TransactionTagsTableFilterComposer
    extends Composer<_$AppDatabase, $TransactionTagsTable> {
  $$TransactionTagsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get transactionId => $composableBuilder(
    column: $table.transactionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get tagId => $composableBuilder(
    column: $table.tagId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$TransactionTagsTableOrderingComposer
    extends Composer<_$AppDatabase, $TransactionTagsTable> {
  $$TransactionTagsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get transactionId => $composableBuilder(
    column: $table.transactionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get tagId => $composableBuilder(
    column: $table.tagId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$TransactionTagsTableAnnotationComposer
    extends Composer<_$AppDatabase, $TransactionTagsTable> {
  $$TransactionTagsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get transactionId => $composableBuilder(
    column: $table.transactionId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get tagId =>
      $composableBuilder(column: $table.tagId, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$TransactionTagsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $TransactionTagsTable,
          TransactionTagRow,
          $$TransactionTagsTableFilterComposer,
          $$TransactionTagsTableOrderingComposer,
          $$TransactionTagsTableAnnotationComposer,
          $$TransactionTagsTableCreateCompanionBuilder,
          $$TransactionTagsTableUpdateCompanionBuilder,
          (
            TransactionTagRow,
            BaseReferences<
              _$AppDatabase,
              $TransactionTagsTable,
              TransactionTagRow
            >,
          ),
          TransactionTagRow,
          PrefetchHooks Function()
        > {
  $$TransactionTagsTableTableManager(
    _$AppDatabase db,
    $TransactionTagsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$TransactionTagsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$TransactionTagsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$TransactionTagsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> transactionId = const Value.absent(),
                Value<String> tagId = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => TransactionTagsCompanion(
                id: id,
                transactionId: transactionId,
                tagId: tagId,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String transactionId,
                required String tagId,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => TransactionTagsCompanion.insert(
                id: id,
                transactionId: transactionId,
                tagId: tagId,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$TransactionTagsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $TransactionTagsTable,
      TransactionTagRow,
      $$TransactionTagsTableFilterComposer,
      $$TransactionTagsTableOrderingComposer,
      $$TransactionTagsTableAnnotationComposer,
      $$TransactionTagsTableCreateCompanionBuilder,
      $$TransactionTagsTableUpdateCompanionBuilder,
      (
        TransactionTagRow,
        BaseReferences<_$AppDatabase, $TransactionTagsTable, TransactionTagRow>,
      ),
      TransactionTagRow,
      PrefetchHooks Function()
    >;
typedef $$RulesTableCreateCompanionBuilder =
    RulesCompanion Function({
      required String id,
      required String name,
      Value<bool> enabled,
      Value<int> priority,
      required String triggerType,
      required String triggerPayload,
      required String actionPayload,
      required int createdAt,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$RulesTableUpdateCompanionBuilder =
    RulesCompanion Function({
      Value<String> id,
      Value<String> name,
      Value<bool> enabled,
      Value<int> priority,
      Value<String> triggerType,
      Value<String> triggerPayload,
      Value<String> actionPayload,
      Value<int> createdAt,
      Value<int> updatedAt,
      Value<int> rowid,
    });

class $$RulesTableFilterComposer extends Composer<_$AppDatabase, $RulesTable> {
  $$RulesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get enabled => $composableBuilder(
    column: $table.enabled,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get priority => $composableBuilder(
    column: $table.priority,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get triggerType => $composableBuilder(
    column: $table.triggerType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get triggerPayload => $composableBuilder(
    column: $table.triggerPayload,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get actionPayload => $composableBuilder(
    column: $table.actionPayload,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$RulesTableOrderingComposer
    extends Composer<_$AppDatabase, $RulesTable> {
  $$RulesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get enabled => $composableBuilder(
    column: $table.enabled,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get priority => $composableBuilder(
    column: $table.priority,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get triggerType => $composableBuilder(
    column: $table.triggerType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get triggerPayload => $composableBuilder(
    column: $table.triggerPayload,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get actionPayload => $composableBuilder(
    column: $table.actionPayload,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$RulesTableAnnotationComposer
    extends Composer<_$AppDatabase, $RulesTable> {
  $$RulesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<bool> get enabled =>
      $composableBuilder(column: $table.enabled, builder: (column) => column);

  GeneratedColumn<int> get priority =>
      $composableBuilder(column: $table.priority, builder: (column) => column);

  GeneratedColumn<String> get triggerType => $composableBuilder(
    column: $table.triggerType,
    builder: (column) => column,
  );

  GeneratedColumn<String> get triggerPayload => $composableBuilder(
    column: $table.triggerPayload,
    builder: (column) => column,
  );

  GeneratedColumn<String> get actionPayload => $composableBuilder(
    column: $table.actionPayload,
    builder: (column) => column,
  );

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$RulesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $RulesTable,
          RuleRow,
          $$RulesTableFilterComposer,
          $$RulesTableOrderingComposer,
          $$RulesTableAnnotationComposer,
          $$RulesTableCreateCompanionBuilder,
          $$RulesTableUpdateCompanionBuilder,
          (RuleRow, BaseReferences<_$AppDatabase, $RulesTable, RuleRow>),
          RuleRow,
          PrefetchHooks Function()
        > {
  $$RulesTableTableManager(_$AppDatabase db, $RulesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$RulesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$RulesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$RulesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<bool> enabled = const Value.absent(),
                Value<int> priority = const Value.absent(),
                Value<String> triggerType = const Value.absent(),
                Value<String> triggerPayload = const Value.absent(),
                Value<String> actionPayload = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => RulesCompanion(
                id: id,
                name: name,
                enabled: enabled,
                priority: priority,
                triggerType: triggerType,
                triggerPayload: triggerPayload,
                actionPayload: actionPayload,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String name,
                Value<bool> enabled = const Value.absent(),
                Value<int> priority = const Value.absent(),
                required String triggerType,
                required String triggerPayload,
                required String actionPayload,
                required int createdAt,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => RulesCompanion.insert(
                id: id,
                name: name,
                enabled: enabled,
                priority: priority,
                triggerType: triggerType,
                triggerPayload: triggerPayload,
                actionPayload: actionPayload,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$RulesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $RulesTable,
      RuleRow,
      $$RulesTableFilterComposer,
      $$RulesTableOrderingComposer,
      $$RulesTableAnnotationComposer,
      $$RulesTableCreateCompanionBuilder,
      $$RulesTableUpdateCompanionBuilder,
      (RuleRow, BaseReferences<_$AppDatabase, $RulesTable, RuleRow>),
      RuleRow,
      PrefetchHooks Function()
    >;
typedef $$RuleMatchesTableCreateCompanionBuilder =
    RuleMatchesCompanion Function({
      required String id,
      required String ruleId,
      required String sourceType,
      required String sourceId,
      Value<String?> transactionId,
      required int matchedAt,
      required String outcome,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$RuleMatchesTableUpdateCompanionBuilder =
    RuleMatchesCompanion Function({
      Value<String> id,
      Value<String> ruleId,
      Value<String> sourceType,
      Value<String> sourceId,
      Value<String?> transactionId,
      Value<int> matchedAt,
      Value<String> outcome,
      Value<int> updatedAt,
      Value<int> rowid,
    });

class $$RuleMatchesTableFilterComposer
    extends Composer<_$AppDatabase, $RuleMatchesTable> {
  $$RuleMatchesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get ruleId => $composableBuilder(
    column: $table.ruleId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sourceType => $composableBuilder(
    column: $table.sourceType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sourceId => $composableBuilder(
    column: $table.sourceId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get transactionId => $composableBuilder(
    column: $table.transactionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get matchedAt => $composableBuilder(
    column: $table.matchedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get outcome => $composableBuilder(
    column: $table.outcome,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$RuleMatchesTableOrderingComposer
    extends Composer<_$AppDatabase, $RuleMatchesTable> {
  $$RuleMatchesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get ruleId => $composableBuilder(
    column: $table.ruleId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sourceType => $composableBuilder(
    column: $table.sourceType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sourceId => $composableBuilder(
    column: $table.sourceId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get transactionId => $composableBuilder(
    column: $table.transactionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get matchedAt => $composableBuilder(
    column: $table.matchedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get outcome => $composableBuilder(
    column: $table.outcome,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$RuleMatchesTableAnnotationComposer
    extends Composer<_$AppDatabase, $RuleMatchesTable> {
  $$RuleMatchesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get ruleId =>
      $composableBuilder(column: $table.ruleId, builder: (column) => column);

  GeneratedColumn<String> get sourceType => $composableBuilder(
    column: $table.sourceType,
    builder: (column) => column,
  );

  GeneratedColumn<String> get sourceId =>
      $composableBuilder(column: $table.sourceId, builder: (column) => column);

  GeneratedColumn<String> get transactionId => $composableBuilder(
    column: $table.transactionId,
    builder: (column) => column,
  );

  GeneratedColumn<int> get matchedAt =>
      $composableBuilder(column: $table.matchedAt, builder: (column) => column);

  GeneratedColumn<String> get outcome =>
      $composableBuilder(column: $table.outcome, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$RuleMatchesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $RuleMatchesTable,
          RuleMatchRow,
          $$RuleMatchesTableFilterComposer,
          $$RuleMatchesTableOrderingComposer,
          $$RuleMatchesTableAnnotationComposer,
          $$RuleMatchesTableCreateCompanionBuilder,
          $$RuleMatchesTableUpdateCompanionBuilder,
          (
            RuleMatchRow,
            BaseReferences<_$AppDatabase, $RuleMatchesTable, RuleMatchRow>,
          ),
          RuleMatchRow,
          PrefetchHooks Function()
        > {
  $$RuleMatchesTableTableManager(_$AppDatabase db, $RuleMatchesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$RuleMatchesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$RuleMatchesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$RuleMatchesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> ruleId = const Value.absent(),
                Value<String> sourceType = const Value.absent(),
                Value<String> sourceId = const Value.absent(),
                Value<String?> transactionId = const Value.absent(),
                Value<int> matchedAt = const Value.absent(),
                Value<String> outcome = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => RuleMatchesCompanion(
                id: id,
                ruleId: ruleId,
                sourceType: sourceType,
                sourceId: sourceId,
                transactionId: transactionId,
                matchedAt: matchedAt,
                outcome: outcome,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String ruleId,
                required String sourceType,
                required String sourceId,
                Value<String?> transactionId = const Value.absent(),
                required int matchedAt,
                required String outcome,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => RuleMatchesCompanion.insert(
                id: id,
                ruleId: ruleId,
                sourceType: sourceType,
                sourceId: sourceId,
                transactionId: transactionId,
                matchedAt: matchedAt,
                outcome: outcome,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$RuleMatchesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $RuleMatchesTable,
      RuleMatchRow,
      $$RuleMatchesTableFilterComposer,
      $$RuleMatchesTableOrderingComposer,
      $$RuleMatchesTableAnnotationComposer,
      $$RuleMatchesTableCreateCompanionBuilder,
      $$RuleMatchesTableUpdateCompanionBuilder,
      (
        RuleMatchRow,
        BaseReferences<_$AppDatabase, $RuleMatchesTable, RuleMatchRow>,
      ),
      RuleMatchRow,
      PrefetchHooks Function()
    >;
typedef $$BudgetsTableCreateCompanionBuilder =
    BudgetsCompanion Function({
      required String id,
      required String categoryId,
      required String month,
      required int targetCents,
      Value<int> rolloverCents,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$BudgetsTableUpdateCompanionBuilder =
    BudgetsCompanion Function({
      Value<String> id,
      Value<String> categoryId,
      Value<String> month,
      Value<int> targetCents,
      Value<int> rolloverCents,
      Value<int> updatedAt,
      Value<int> rowid,
    });

class $$BudgetsTableFilterComposer
    extends Composer<_$AppDatabase, $BudgetsTable> {
  $$BudgetsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get categoryId => $composableBuilder(
    column: $table.categoryId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get month => $composableBuilder(
    column: $table.month,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get targetCents => $composableBuilder(
    column: $table.targetCents,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get rolloverCents => $composableBuilder(
    column: $table.rolloverCents,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$BudgetsTableOrderingComposer
    extends Composer<_$AppDatabase, $BudgetsTable> {
  $$BudgetsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get categoryId => $composableBuilder(
    column: $table.categoryId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get month => $composableBuilder(
    column: $table.month,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get targetCents => $composableBuilder(
    column: $table.targetCents,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get rolloverCents => $composableBuilder(
    column: $table.rolloverCents,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$BudgetsTableAnnotationComposer
    extends Composer<_$AppDatabase, $BudgetsTable> {
  $$BudgetsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get categoryId => $composableBuilder(
    column: $table.categoryId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get month =>
      $composableBuilder(column: $table.month, builder: (column) => column);

  GeneratedColumn<int> get targetCents => $composableBuilder(
    column: $table.targetCents,
    builder: (column) => column,
  );

  GeneratedColumn<int> get rolloverCents => $composableBuilder(
    column: $table.rolloverCents,
    builder: (column) => column,
  );

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$BudgetsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $BudgetsTable,
          BudgetRow,
          $$BudgetsTableFilterComposer,
          $$BudgetsTableOrderingComposer,
          $$BudgetsTableAnnotationComposer,
          $$BudgetsTableCreateCompanionBuilder,
          $$BudgetsTableUpdateCompanionBuilder,
          (BudgetRow, BaseReferences<_$AppDatabase, $BudgetsTable, BudgetRow>),
          BudgetRow,
          PrefetchHooks Function()
        > {
  $$BudgetsTableTableManager(_$AppDatabase db, $BudgetsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$BudgetsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$BudgetsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$BudgetsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> categoryId = const Value.absent(),
                Value<String> month = const Value.absent(),
                Value<int> targetCents = const Value.absent(),
                Value<int> rolloverCents = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => BudgetsCompanion(
                id: id,
                categoryId: categoryId,
                month: month,
                targetCents: targetCents,
                rolloverCents: rolloverCents,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String categoryId,
                required String month,
                required int targetCents,
                Value<int> rolloverCents = const Value.absent(),
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => BudgetsCompanion.insert(
                id: id,
                categoryId: categoryId,
                month: month,
                targetCents: targetCents,
                rolloverCents: rolloverCents,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$BudgetsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $BudgetsTable,
      BudgetRow,
      $$BudgetsTableFilterComposer,
      $$BudgetsTableOrderingComposer,
      $$BudgetsTableAnnotationComposer,
      $$BudgetsTableCreateCompanionBuilder,
      $$BudgetsTableUpdateCompanionBuilder,
      (BudgetRow, BaseReferences<_$AppDatabase, $BudgetsTable, BudgetRow>),
      BudgetRow,
      PrefetchHooks Function()
    >;
typedef $$RecurrencesTableCreateCompanionBuilder =
    RecurrencesCompanion Function({
      required String id,
      required String accountId,
      Value<String?> categoryId,
      Value<String?> payeeId,
      Value<String?> payeeName,
      required int amountCents,
      Value<String?> notes,
      required String cadence,
      required String nextDate,
      Value<int?> anchorDay,
      required int createdAt,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$RecurrencesTableUpdateCompanionBuilder =
    RecurrencesCompanion Function({
      Value<String> id,
      Value<String> accountId,
      Value<String?> categoryId,
      Value<String?> payeeId,
      Value<String?> payeeName,
      Value<int> amountCents,
      Value<String?> notes,
      Value<String> cadence,
      Value<String> nextDate,
      Value<int?> anchorDay,
      Value<int> createdAt,
      Value<int> updatedAt,
      Value<int> rowid,
    });

class $$RecurrencesTableFilterComposer
    extends Composer<_$AppDatabase, $RecurrencesTable> {
  $$RecurrencesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get accountId => $composableBuilder(
    column: $table.accountId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get categoryId => $composableBuilder(
    column: $table.categoryId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payeeId => $composableBuilder(
    column: $table.payeeId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payeeName => $composableBuilder(
    column: $table.payeeName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get amountCents => $composableBuilder(
    column: $table.amountCents,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cadence => $composableBuilder(
    column: $table.cadence,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nextDate => $composableBuilder(
    column: $table.nextDate,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get anchorDay => $composableBuilder(
    column: $table.anchorDay,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$RecurrencesTableOrderingComposer
    extends Composer<_$AppDatabase, $RecurrencesTable> {
  $$RecurrencesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get accountId => $composableBuilder(
    column: $table.accountId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get categoryId => $composableBuilder(
    column: $table.categoryId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payeeId => $composableBuilder(
    column: $table.payeeId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payeeName => $composableBuilder(
    column: $table.payeeName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get amountCents => $composableBuilder(
    column: $table.amountCents,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cadence => $composableBuilder(
    column: $table.cadence,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nextDate => $composableBuilder(
    column: $table.nextDate,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get anchorDay => $composableBuilder(
    column: $table.anchorDay,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$RecurrencesTableAnnotationComposer
    extends Composer<_$AppDatabase, $RecurrencesTable> {
  $$RecurrencesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get accountId =>
      $composableBuilder(column: $table.accountId, builder: (column) => column);

  GeneratedColumn<String> get categoryId => $composableBuilder(
    column: $table.categoryId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get payeeId =>
      $composableBuilder(column: $table.payeeId, builder: (column) => column);

  GeneratedColumn<String> get payeeName =>
      $composableBuilder(column: $table.payeeName, builder: (column) => column);

  GeneratedColumn<int> get amountCents => $composableBuilder(
    column: $table.amountCents,
    builder: (column) => column,
  );

  GeneratedColumn<String> get notes =>
      $composableBuilder(column: $table.notes, builder: (column) => column);

  GeneratedColumn<String> get cadence =>
      $composableBuilder(column: $table.cadence, builder: (column) => column);

  GeneratedColumn<String> get nextDate =>
      $composableBuilder(column: $table.nextDate, builder: (column) => column);

  GeneratedColumn<int> get anchorDay =>
      $composableBuilder(column: $table.anchorDay, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$RecurrencesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $RecurrencesTable,
          RecurrenceRow,
          $$RecurrencesTableFilterComposer,
          $$RecurrencesTableOrderingComposer,
          $$RecurrencesTableAnnotationComposer,
          $$RecurrencesTableCreateCompanionBuilder,
          $$RecurrencesTableUpdateCompanionBuilder,
          (
            RecurrenceRow,
            BaseReferences<_$AppDatabase, $RecurrencesTable, RecurrenceRow>,
          ),
          RecurrenceRow,
          PrefetchHooks Function()
        > {
  $$RecurrencesTableTableManager(_$AppDatabase db, $RecurrencesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$RecurrencesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$RecurrencesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$RecurrencesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> accountId = const Value.absent(),
                Value<String?> categoryId = const Value.absent(),
                Value<String?> payeeId = const Value.absent(),
                Value<String?> payeeName = const Value.absent(),
                Value<int> amountCents = const Value.absent(),
                Value<String?> notes = const Value.absent(),
                Value<String> cadence = const Value.absent(),
                Value<String> nextDate = const Value.absent(),
                Value<int?> anchorDay = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => RecurrencesCompanion(
                id: id,
                accountId: accountId,
                categoryId: categoryId,
                payeeId: payeeId,
                payeeName: payeeName,
                amountCents: amountCents,
                notes: notes,
                cadence: cadence,
                nextDate: nextDate,
                anchorDay: anchorDay,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String accountId,
                Value<String?> categoryId = const Value.absent(),
                Value<String?> payeeId = const Value.absent(),
                Value<String?> payeeName = const Value.absent(),
                required int amountCents,
                Value<String?> notes = const Value.absent(),
                required String cadence,
                required String nextDate,
                Value<int?> anchorDay = const Value.absent(),
                required int createdAt,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => RecurrencesCompanion.insert(
                id: id,
                accountId: accountId,
                categoryId: categoryId,
                payeeId: payeeId,
                payeeName: payeeName,
                amountCents: amountCents,
                notes: notes,
                cadence: cadence,
                nextDate: nextDate,
                anchorDay: anchorDay,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$RecurrencesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $RecurrencesTable,
      RecurrenceRow,
      $$RecurrencesTableFilterComposer,
      $$RecurrencesTableOrderingComposer,
      $$RecurrencesTableAnnotationComposer,
      $$RecurrencesTableCreateCompanionBuilder,
      $$RecurrencesTableUpdateCompanionBuilder,
      (
        RecurrenceRow,
        BaseReferences<_$AppDatabase, $RecurrencesTable, RecurrenceRow>,
      ),
      RecurrenceRow,
      PrefetchHooks Function()
    >;
typedef $$SmsMessagesTableCreateCompanionBuilder =
    SmsMessagesCompanion Function({
      Value<int> id,
      Value<String?> androidId,
      required String address,
      required String body,
      required int receivedAt,
      Value<String> classifiedAs,
      Value<int?> parserVersion,
      Value<String?> candidateJson,
      Value<String> candidateStatus,
      Value<String?> linkedTransactionId,
      Value<String?> userNote,
      Value<int?> noteCapturedAt,
      Value<double?> locationLat,
      Value<double?> locationLng,
      Value<int?> locationAccuracyM,
      Value<int?> locationCapturedAt,
      Value<String?> locationPlaceName,
      Value<String> enrichmentStatus,
      Value<String?> enrichedCandidateJson,
      Value<int?> enrichedAt,
      Value<String?> stableSmsId,
      Value<int> parseAttemptCount,
      Value<int?> nextParseAfter,
      Value<String?> lastParseError,
      Value<int?> parsedAt,
    });
typedef $$SmsMessagesTableUpdateCompanionBuilder =
    SmsMessagesCompanion Function({
      Value<int> id,
      Value<String?> androidId,
      Value<String> address,
      Value<String> body,
      Value<int> receivedAt,
      Value<String> classifiedAs,
      Value<int?> parserVersion,
      Value<String?> candidateJson,
      Value<String> candidateStatus,
      Value<String?> linkedTransactionId,
      Value<String?> userNote,
      Value<int?> noteCapturedAt,
      Value<double?> locationLat,
      Value<double?> locationLng,
      Value<int?> locationAccuracyM,
      Value<int?> locationCapturedAt,
      Value<String?> locationPlaceName,
      Value<String> enrichmentStatus,
      Value<String?> enrichedCandidateJson,
      Value<int?> enrichedAt,
      Value<String?> stableSmsId,
      Value<int> parseAttemptCount,
      Value<int?> nextParseAfter,
      Value<String?> lastParseError,
      Value<int?> parsedAt,
    });

class $$SmsMessagesTableFilterComposer
    extends Composer<_$AppDatabase, $SmsMessagesTable> {
  $$SmsMessagesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get androidId => $composableBuilder(
    column: $table.androidId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get address => $composableBuilder(
    column: $table.address,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get body => $composableBuilder(
    column: $table.body,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get receivedAt => $composableBuilder(
    column: $table.receivedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get classifiedAs => $composableBuilder(
    column: $table.classifiedAs,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get parserVersion => $composableBuilder(
    column: $table.parserVersion,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get candidateJson => $composableBuilder(
    column: $table.candidateJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get candidateStatus => $composableBuilder(
    column: $table.candidateStatus,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get linkedTransactionId => $composableBuilder(
    column: $table.linkedTransactionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get userNote => $composableBuilder(
    column: $table.userNote,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get noteCapturedAt => $composableBuilder(
    column: $table.noteCapturedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get locationLat => $composableBuilder(
    column: $table.locationLat,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get locationLng => $composableBuilder(
    column: $table.locationLng,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get locationAccuracyM => $composableBuilder(
    column: $table.locationAccuracyM,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get locationCapturedAt => $composableBuilder(
    column: $table.locationCapturedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get locationPlaceName => $composableBuilder(
    column: $table.locationPlaceName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get enrichmentStatus => $composableBuilder(
    column: $table.enrichmentStatus,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get enrichedCandidateJson => $composableBuilder(
    column: $table.enrichedCandidateJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get enrichedAt => $composableBuilder(
    column: $table.enrichedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get stableSmsId => $composableBuilder(
    column: $table.stableSmsId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get parseAttemptCount => $composableBuilder(
    column: $table.parseAttemptCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get nextParseAfter => $composableBuilder(
    column: $table.nextParseAfter,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get lastParseError => $composableBuilder(
    column: $table.lastParseError,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get parsedAt => $composableBuilder(
    column: $table.parsedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SmsMessagesTableOrderingComposer
    extends Composer<_$AppDatabase, $SmsMessagesTable> {
  $$SmsMessagesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get androidId => $composableBuilder(
    column: $table.androidId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get address => $composableBuilder(
    column: $table.address,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get body => $composableBuilder(
    column: $table.body,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get receivedAt => $composableBuilder(
    column: $table.receivedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get classifiedAs => $composableBuilder(
    column: $table.classifiedAs,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get parserVersion => $composableBuilder(
    column: $table.parserVersion,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get candidateJson => $composableBuilder(
    column: $table.candidateJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get candidateStatus => $composableBuilder(
    column: $table.candidateStatus,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get linkedTransactionId => $composableBuilder(
    column: $table.linkedTransactionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get userNote => $composableBuilder(
    column: $table.userNote,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get noteCapturedAt => $composableBuilder(
    column: $table.noteCapturedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get locationLat => $composableBuilder(
    column: $table.locationLat,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get locationLng => $composableBuilder(
    column: $table.locationLng,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get locationAccuracyM => $composableBuilder(
    column: $table.locationAccuracyM,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get locationCapturedAt => $composableBuilder(
    column: $table.locationCapturedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get locationPlaceName => $composableBuilder(
    column: $table.locationPlaceName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get enrichmentStatus => $composableBuilder(
    column: $table.enrichmentStatus,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get enrichedCandidateJson => $composableBuilder(
    column: $table.enrichedCandidateJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get enrichedAt => $composableBuilder(
    column: $table.enrichedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get stableSmsId => $composableBuilder(
    column: $table.stableSmsId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get parseAttemptCount => $composableBuilder(
    column: $table.parseAttemptCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get nextParseAfter => $composableBuilder(
    column: $table.nextParseAfter,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get lastParseError => $composableBuilder(
    column: $table.lastParseError,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get parsedAt => $composableBuilder(
    column: $table.parsedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SmsMessagesTableAnnotationComposer
    extends Composer<_$AppDatabase, $SmsMessagesTable> {
  $$SmsMessagesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get androidId =>
      $composableBuilder(column: $table.androidId, builder: (column) => column);

  GeneratedColumn<String> get address =>
      $composableBuilder(column: $table.address, builder: (column) => column);

  GeneratedColumn<String> get body =>
      $composableBuilder(column: $table.body, builder: (column) => column);

  GeneratedColumn<int> get receivedAt => $composableBuilder(
    column: $table.receivedAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get classifiedAs => $composableBuilder(
    column: $table.classifiedAs,
    builder: (column) => column,
  );

  GeneratedColumn<int> get parserVersion => $composableBuilder(
    column: $table.parserVersion,
    builder: (column) => column,
  );

  GeneratedColumn<String> get candidateJson => $composableBuilder(
    column: $table.candidateJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get candidateStatus => $composableBuilder(
    column: $table.candidateStatus,
    builder: (column) => column,
  );

  GeneratedColumn<String> get linkedTransactionId => $composableBuilder(
    column: $table.linkedTransactionId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get userNote =>
      $composableBuilder(column: $table.userNote, builder: (column) => column);

  GeneratedColumn<int> get noteCapturedAt => $composableBuilder(
    column: $table.noteCapturedAt,
    builder: (column) => column,
  );

  GeneratedColumn<double> get locationLat => $composableBuilder(
    column: $table.locationLat,
    builder: (column) => column,
  );

  GeneratedColumn<double> get locationLng => $composableBuilder(
    column: $table.locationLng,
    builder: (column) => column,
  );

  GeneratedColumn<int> get locationAccuracyM => $composableBuilder(
    column: $table.locationAccuracyM,
    builder: (column) => column,
  );

  GeneratedColumn<int> get locationCapturedAt => $composableBuilder(
    column: $table.locationCapturedAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get locationPlaceName => $composableBuilder(
    column: $table.locationPlaceName,
    builder: (column) => column,
  );

  GeneratedColumn<String> get enrichmentStatus => $composableBuilder(
    column: $table.enrichmentStatus,
    builder: (column) => column,
  );

  GeneratedColumn<String> get enrichedCandidateJson => $composableBuilder(
    column: $table.enrichedCandidateJson,
    builder: (column) => column,
  );

  GeneratedColumn<int> get enrichedAt => $composableBuilder(
    column: $table.enrichedAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get stableSmsId => $composableBuilder(
    column: $table.stableSmsId,
    builder: (column) => column,
  );

  GeneratedColumn<int> get parseAttemptCount => $composableBuilder(
    column: $table.parseAttemptCount,
    builder: (column) => column,
  );

  GeneratedColumn<int> get nextParseAfter => $composableBuilder(
    column: $table.nextParseAfter,
    builder: (column) => column,
  );

  GeneratedColumn<String> get lastParseError => $composableBuilder(
    column: $table.lastParseError,
    builder: (column) => column,
  );

  GeneratedColumn<int> get parsedAt =>
      $composableBuilder(column: $table.parsedAt, builder: (column) => column);
}

class $$SmsMessagesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SmsMessagesTable,
          SmsRow,
          $$SmsMessagesTableFilterComposer,
          $$SmsMessagesTableOrderingComposer,
          $$SmsMessagesTableAnnotationComposer,
          $$SmsMessagesTableCreateCompanionBuilder,
          $$SmsMessagesTableUpdateCompanionBuilder,
          (SmsRow, BaseReferences<_$AppDatabase, $SmsMessagesTable, SmsRow>),
          SmsRow,
          PrefetchHooks Function()
        > {
  $$SmsMessagesTableTableManager(_$AppDatabase db, $SmsMessagesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SmsMessagesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SmsMessagesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SmsMessagesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String?> androidId = const Value.absent(),
                Value<String> address = const Value.absent(),
                Value<String> body = const Value.absent(),
                Value<int> receivedAt = const Value.absent(),
                Value<String> classifiedAs = const Value.absent(),
                Value<int?> parserVersion = const Value.absent(),
                Value<String?> candidateJson = const Value.absent(),
                Value<String> candidateStatus = const Value.absent(),
                Value<String?> linkedTransactionId = const Value.absent(),
                Value<String?> userNote = const Value.absent(),
                Value<int?> noteCapturedAt = const Value.absent(),
                Value<double?> locationLat = const Value.absent(),
                Value<double?> locationLng = const Value.absent(),
                Value<int?> locationAccuracyM = const Value.absent(),
                Value<int?> locationCapturedAt = const Value.absent(),
                Value<String?> locationPlaceName = const Value.absent(),
                Value<String> enrichmentStatus = const Value.absent(),
                Value<String?> enrichedCandidateJson = const Value.absent(),
                Value<int?> enrichedAt = const Value.absent(),
                Value<String?> stableSmsId = const Value.absent(),
                Value<int> parseAttemptCount = const Value.absent(),
                Value<int?> nextParseAfter = const Value.absent(),
                Value<String?> lastParseError = const Value.absent(),
                Value<int?> parsedAt = const Value.absent(),
              }) => SmsMessagesCompanion(
                id: id,
                androidId: androidId,
                address: address,
                body: body,
                receivedAt: receivedAt,
                classifiedAs: classifiedAs,
                parserVersion: parserVersion,
                candidateJson: candidateJson,
                candidateStatus: candidateStatus,
                linkedTransactionId: linkedTransactionId,
                userNote: userNote,
                noteCapturedAt: noteCapturedAt,
                locationLat: locationLat,
                locationLng: locationLng,
                locationAccuracyM: locationAccuracyM,
                locationCapturedAt: locationCapturedAt,
                locationPlaceName: locationPlaceName,
                enrichmentStatus: enrichmentStatus,
                enrichedCandidateJson: enrichedCandidateJson,
                enrichedAt: enrichedAt,
                stableSmsId: stableSmsId,
                parseAttemptCount: parseAttemptCount,
                nextParseAfter: nextParseAfter,
                lastParseError: lastParseError,
                parsedAt: parsedAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String?> androidId = const Value.absent(),
                required String address,
                required String body,
                required int receivedAt,
                Value<String> classifiedAs = const Value.absent(),
                Value<int?> parserVersion = const Value.absent(),
                Value<String?> candidateJson = const Value.absent(),
                Value<String> candidateStatus = const Value.absent(),
                Value<String?> linkedTransactionId = const Value.absent(),
                Value<String?> userNote = const Value.absent(),
                Value<int?> noteCapturedAt = const Value.absent(),
                Value<double?> locationLat = const Value.absent(),
                Value<double?> locationLng = const Value.absent(),
                Value<int?> locationAccuracyM = const Value.absent(),
                Value<int?> locationCapturedAt = const Value.absent(),
                Value<String?> locationPlaceName = const Value.absent(),
                Value<String> enrichmentStatus = const Value.absent(),
                Value<String?> enrichedCandidateJson = const Value.absent(),
                Value<int?> enrichedAt = const Value.absent(),
                Value<String?> stableSmsId = const Value.absent(),
                Value<int> parseAttemptCount = const Value.absent(),
                Value<int?> nextParseAfter = const Value.absent(),
                Value<String?> lastParseError = const Value.absent(),
                Value<int?> parsedAt = const Value.absent(),
              }) => SmsMessagesCompanion.insert(
                id: id,
                androidId: androidId,
                address: address,
                body: body,
                receivedAt: receivedAt,
                classifiedAs: classifiedAs,
                parserVersion: parserVersion,
                candidateJson: candidateJson,
                candidateStatus: candidateStatus,
                linkedTransactionId: linkedTransactionId,
                userNote: userNote,
                noteCapturedAt: noteCapturedAt,
                locationLat: locationLat,
                locationLng: locationLng,
                locationAccuracyM: locationAccuracyM,
                locationCapturedAt: locationCapturedAt,
                locationPlaceName: locationPlaceName,
                enrichmentStatus: enrichmentStatus,
                enrichedCandidateJson: enrichedCandidateJson,
                enrichedAt: enrichedAt,
                stableSmsId: stableSmsId,
                parseAttemptCount: parseAttemptCount,
                nextParseAfter: nextParseAfter,
                lastParseError: lastParseError,
                parsedAt: parsedAt,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SmsMessagesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SmsMessagesTable,
      SmsRow,
      $$SmsMessagesTableFilterComposer,
      $$SmsMessagesTableOrderingComposer,
      $$SmsMessagesTableAnnotationComposer,
      $$SmsMessagesTableCreateCompanionBuilder,
      $$SmsMessagesTableUpdateCompanionBuilder,
      (SmsRow, BaseReferences<_$AppDatabase, $SmsMessagesTable, SmsRow>),
      SmsRow,
      PrefetchHooks Function()
    >;
typedef $$SmsParseCacheTableCreateCompanionBuilder =
    SmsParseCacheCompanion Function({
      required String key,
      Value<String?> senderSample,
      required String bodyTemplate,
      required String payloadJson,
      Value<int> hits,
      required int createdAt,
      required int lastSeenAt,
      Value<int> rowid,
    });
typedef $$SmsParseCacheTableUpdateCompanionBuilder =
    SmsParseCacheCompanion Function({
      Value<String> key,
      Value<String?> senderSample,
      Value<String> bodyTemplate,
      Value<String> payloadJson,
      Value<int> hits,
      Value<int> createdAt,
      Value<int> lastSeenAt,
      Value<int> rowid,
    });

class $$SmsParseCacheTableFilterComposer
    extends Composer<_$AppDatabase, $SmsParseCacheTable> {
  $$SmsParseCacheTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get senderSample => $composableBuilder(
    column: $table.senderSample,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get bodyTemplate => $composableBuilder(
    column: $table.bodyTemplate,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get hits => $composableBuilder(
    column: $table.hits,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get lastSeenAt => $composableBuilder(
    column: $table.lastSeenAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SmsParseCacheTableOrderingComposer
    extends Composer<_$AppDatabase, $SmsParseCacheTable> {
  $$SmsParseCacheTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get senderSample => $composableBuilder(
    column: $table.senderSample,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get bodyTemplate => $composableBuilder(
    column: $table.bodyTemplate,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get hits => $composableBuilder(
    column: $table.hits,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get lastSeenAt => $composableBuilder(
    column: $table.lastSeenAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SmsParseCacheTableAnnotationComposer
    extends Composer<_$AppDatabase, $SmsParseCacheTable> {
  $$SmsParseCacheTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get senderSample => $composableBuilder(
    column: $table.senderSample,
    builder: (column) => column,
  );

  GeneratedColumn<String> get bodyTemplate => $composableBuilder(
    column: $table.bodyTemplate,
    builder: (column) => column,
  );

  GeneratedColumn<String> get payloadJson => $composableBuilder(
    column: $table.payloadJson,
    builder: (column) => column,
  );

  GeneratedColumn<int> get hits =>
      $composableBuilder(column: $table.hits, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get lastSeenAt => $composableBuilder(
    column: $table.lastSeenAt,
    builder: (column) => column,
  );
}

class $$SmsParseCacheTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SmsParseCacheTable,
          SmsParseCacheRow,
          $$SmsParseCacheTableFilterComposer,
          $$SmsParseCacheTableOrderingComposer,
          $$SmsParseCacheTableAnnotationComposer,
          $$SmsParseCacheTableCreateCompanionBuilder,
          $$SmsParseCacheTableUpdateCompanionBuilder,
          (
            SmsParseCacheRow,
            BaseReferences<
              _$AppDatabase,
              $SmsParseCacheTable,
              SmsParseCacheRow
            >,
          ),
          SmsParseCacheRow,
          PrefetchHooks Function()
        > {
  $$SmsParseCacheTableTableManager(_$AppDatabase db, $SmsParseCacheTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SmsParseCacheTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SmsParseCacheTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SmsParseCacheTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> key = const Value.absent(),
                Value<String?> senderSample = const Value.absent(),
                Value<String> bodyTemplate = const Value.absent(),
                Value<String> payloadJson = const Value.absent(),
                Value<int> hits = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> lastSeenAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SmsParseCacheCompanion(
                key: key,
                senderSample: senderSample,
                bodyTemplate: bodyTemplate,
                payloadJson: payloadJson,
                hits: hits,
                createdAt: createdAt,
                lastSeenAt: lastSeenAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String key,
                Value<String?> senderSample = const Value.absent(),
                required String bodyTemplate,
                required String payloadJson,
                Value<int> hits = const Value.absent(),
                required int createdAt,
                required int lastSeenAt,
                Value<int> rowid = const Value.absent(),
              }) => SmsParseCacheCompanion.insert(
                key: key,
                senderSample: senderSample,
                bodyTemplate: bodyTemplate,
                payloadJson: payloadJson,
                hits: hits,
                createdAt: createdAt,
                lastSeenAt: lastSeenAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SmsParseCacheTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SmsParseCacheTable,
      SmsParseCacheRow,
      $$SmsParseCacheTableFilterComposer,
      $$SmsParseCacheTableOrderingComposer,
      $$SmsParseCacheTableAnnotationComposer,
      $$SmsParseCacheTableCreateCompanionBuilder,
      $$SmsParseCacheTableUpdateCompanionBuilder,
      (
        SmsParseCacheRow,
        BaseReferences<_$AppDatabase, $SmsParseCacheTable, SmsParseCacheRow>,
      ),
      SmsParseCacheRow,
      PrefetchHooks Function()
    >;
typedef $$AppKvTableCreateCompanionBuilder =
    AppKvCompanion Function({
      required String key,
      Value<String?> value,
      Value<int> rowid,
    });
typedef $$AppKvTableUpdateCompanionBuilder =
    AppKvCompanion Function({
      Value<String> key,
      Value<String?> value,
      Value<int> rowid,
    });

class $$AppKvTableFilterComposer extends Composer<_$AppDatabase, $AppKvTable> {
  $$AppKvTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnFilters(column),
  );
}

class $$AppKvTableOrderingComposer
    extends Composer<_$AppDatabase, $AppKvTable> {
  $$AppKvTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$AppKvTableAnnotationComposer
    extends Composer<_$AppDatabase, $AppKvTable> {
  $$AppKvTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get value =>
      $composableBuilder(column: $table.value, builder: (column) => column);
}

class $$AppKvTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $AppKvTable,
          AppKvRow,
          $$AppKvTableFilterComposer,
          $$AppKvTableOrderingComposer,
          $$AppKvTableAnnotationComposer,
          $$AppKvTableCreateCompanionBuilder,
          $$AppKvTableUpdateCompanionBuilder,
          (AppKvRow, BaseReferences<_$AppDatabase, $AppKvTable, AppKvRow>),
          AppKvRow,
          PrefetchHooks Function()
        > {
  $$AppKvTableTableManager(_$AppDatabase db, $AppKvTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AppKvTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AppKvTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AppKvTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> key = const Value.absent(),
                Value<String?> value = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => AppKvCompanion(key: key, value: value, rowid: rowid),
          createCompanionCallback:
              ({
                required String key,
                Value<String?> value = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => AppKvCompanion.insert(key: key, value: value, rowid: rowid),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$AppKvTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $AppKvTable,
      AppKvRow,
      $$AppKvTableFilterComposer,
      $$AppKvTableOrderingComposer,
      $$AppKvTableAnnotationComposer,
      $$AppKvTableCreateCompanionBuilder,
      $$AppKvTableUpdateCompanionBuilder,
      (AppKvRow, BaseReferences<_$AppDatabase, $AppKvTable, AppKvRow>),
      AppKvRow,
      PrefetchHooks Function()
    >;
typedef $$AuditLogTableCreateCompanionBuilder =
    AuditLogCompanion Function({
      Value<int> id,
      required int at,
      required String level,
      required String event,
      Value<String?> payload,
    });
typedef $$AuditLogTableUpdateCompanionBuilder =
    AuditLogCompanion Function({
      Value<int> id,
      Value<int> at,
      Value<String> level,
      Value<String> event,
      Value<String?> payload,
    });

class $$AuditLogTableFilterComposer
    extends Composer<_$AppDatabase, $AuditLogTable> {
  $$AuditLogTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get at => $composableBuilder(
    column: $table.at,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get level => $composableBuilder(
    column: $table.level,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get event => $composableBuilder(
    column: $table.event,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payload => $composableBuilder(
    column: $table.payload,
    builder: (column) => ColumnFilters(column),
  );
}

class $$AuditLogTableOrderingComposer
    extends Composer<_$AppDatabase, $AuditLogTable> {
  $$AuditLogTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get at => $composableBuilder(
    column: $table.at,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get level => $composableBuilder(
    column: $table.level,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get event => $composableBuilder(
    column: $table.event,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payload => $composableBuilder(
    column: $table.payload,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$AuditLogTableAnnotationComposer
    extends Composer<_$AppDatabase, $AuditLogTable> {
  $$AuditLogTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<int> get at =>
      $composableBuilder(column: $table.at, builder: (column) => column);

  GeneratedColumn<String> get level =>
      $composableBuilder(column: $table.level, builder: (column) => column);

  GeneratedColumn<String> get event =>
      $composableBuilder(column: $table.event, builder: (column) => column);

  GeneratedColumn<String> get payload =>
      $composableBuilder(column: $table.payload, builder: (column) => column);
}

class $$AuditLogTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $AuditLogTable,
          AuditLogRow,
          $$AuditLogTableFilterComposer,
          $$AuditLogTableOrderingComposer,
          $$AuditLogTableAnnotationComposer,
          $$AuditLogTableCreateCompanionBuilder,
          $$AuditLogTableUpdateCompanionBuilder,
          (
            AuditLogRow,
            BaseReferences<_$AppDatabase, $AuditLogTable, AuditLogRow>,
          ),
          AuditLogRow,
          PrefetchHooks Function()
        > {
  $$AuditLogTableTableManager(_$AppDatabase db, $AuditLogTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AuditLogTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AuditLogTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AuditLogTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<int> at = const Value.absent(),
                Value<String> level = const Value.absent(),
                Value<String> event = const Value.absent(),
                Value<String?> payload = const Value.absent(),
              }) => AuditLogCompanion(
                id: id,
                at: at,
                level: level,
                event: event,
                payload: payload,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required int at,
                required String level,
                required String event,
                Value<String?> payload = const Value.absent(),
              }) => AuditLogCompanion.insert(
                id: id,
                at: at,
                level: level,
                event: event,
                payload: payload,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$AuditLogTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $AuditLogTable,
      AuditLogRow,
      $$AuditLogTableFilterComposer,
      $$AuditLogTableOrderingComposer,
      $$AuditLogTableAnnotationComposer,
      $$AuditLogTableCreateCompanionBuilder,
      $$AuditLogTableUpdateCompanionBuilder,
      (AuditLogRow, BaseReferences<_$AppDatabase, $AuditLogTable, AuditLogRow>),
      AuditLogRow,
      PrefetchHooks Function()
    >;
typedef $$ChangeLogTableCreateCompanionBuilder =
    ChangeLogCompanion Function({
      Value<int> id,
      required int at,
      Value<String> clientChangeId,
      required String resource,
      required String resourceId,
      required String op,
      Value<String?> payload,
      Value<bool> synced,
    });
typedef $$ChangeLogTableUpdateCompanionBuilder =
    ChangeLogCompanion Function({
      Value<int> id,
      Value<int> at,
      Value<String> clientChangeId,
      Value<String> resource,
      Value<String> resourceId,
      Value<String> op,
      Value<String?> payload,
      Value<bool> synced,
    });

class $$ChangeLogTableFilterComposer
    extends Composer<_$AppDatabase, $ChangeLogTable> {
  $$ChangeLogTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get at => $composableBuilder(
    column: $table.at,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get clientChangeId => $composableBuilder(
    column: $table.clientChangeId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get resource => $composableBuilder(
    column: $table.resource,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get resourceId => $composableBuilder(
    column: $table.resourceId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get op => $composableBuilder(
    column: $table.op,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payload => $composableBuilder(
    column: $table.payload,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get synced => $composableBuilder(
    column: $table.synced,
    builder: (column) => ColumnFilters(column),
  );
}

class $$ChangeLogTableOrderingComposer
    extends Composer<_$AppDatabase, $ChangeLogTable> {
  $$ChangeLogTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get at => $composableBuilder(
    column: $table.at,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get clientChangeId => $composableBuilder(
    column: $table.clientChangeId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get resource => $composableBuilder(
    column: $table.resource,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get resourceId => $composableBuilder(
    column: $table.resourceId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get op => $composableBuilder(
    column: $table.op,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payload => $composableBuilder(
    column: $table.payload,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get synced => $composableBuilder(
    column: $table.synced,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ChangeLogTableAnnotationComposer
    extends Composer<_$AppDatabase, $ChangeLogTable> {
  $$ChangeLogTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<int> get at =>
      $composableBuilder(column: $table.at, builder: (column) => column);

  GeneratedColumn<String> get clientChangeId => $composableBuilder(
    column: $table.clientChangeId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get resource =>
      $composableBuilder(column: $table.resource, builder: (column) => column);

  GeneratedColumn<String> get resourceId => $composableBuilder(
    column: $table.resourceId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get op =>
      $composableBuilder(column: $table.op, builder: (column) => column);

  GeneratedColumn<String> get payload =>
      $composableBuilder(column: $table.payload, builder: (column) => column);

  GeneratedColumn<bool> get synced =>
      $composableBuilder(column: $table.synced, builder: (column) => column);
}

class $$ChangeLogTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ChangeLogTable,
          ChangeLogRow,
          $$ChangeLogTableFilterComposer,
          $$ChangeLogTableOrderingComposer,
          $$ChangeLogTableAnnotationComposer,
          $$ChangeLogTableCreateCompanionBuilder,
          $$ChangeLogTableUpdateCompanionBuilder,
          (
            ChangeLogRow,
            BaseReferences<_$AppDatabase, $ChangeLogTable, ChangeLogRow>,
          ),
          ChangeLogRow,
          PrefetchHooks Function()
        > {
  $$ChangeLogTableTableManager(_$AppDatabase db, $ChangeLogTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ChangeLogTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ChangeLogTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ChangeLogTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<int> at = const Value.absent(),
                Value<String> clientChangeId = const Value.absent(),
                Value<String> resource = const Value.absent(),
                Value<String> resourceId = const Value.absent(),
                Value<String> op = const Value.absent(),
                Value<String?> payload = const Value.absent(),
                Value<bool> synced = const Value.absent(),
              }) => ChangeLogCompanion(
                id: id,
                at: at,
                clientChangeId: clientChangeId,
                resource: resource,
                resourceId: resourceId,
                op: op,
                payload: payload,
                synced: synced,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required int at,
                Value<String> clientChangeId = const Value.absent(),
                required String resource,
                required String resourceId,
                required String op,
                Value<String?> payload = const Value.absent(),
                Value<bool> synced = const Value.absent(),
              }) => ChangeLogCompanion.insert(
                id: id,
                at: at,
                clientChangeId: clientChangeId,
                resource: resource,
                resourceId: resourceId,
                op: op,
                payload: payload,
                synced: synced,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ChangeLogTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ChangeLogTable,
      ChangeLogRow,
      $$ChangeLogTableFilterComposer,
      $$ChangeLogTableOrderingComposer,
      $$ChangeLogTableAnnotationComposer,
      $$ChangeLogTableCreateCompanionBuilder,
      $$ChangeLogTableUpdateCompanionBuilder,
      (
        ChangeLogRow,
        BaseReferences<_$AppDatabase, $ChangeLogTable, ChangeLogRow>,
      ),
      ChangeLogRow,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$AccountsTableTableManager get accounts =>
      $$AccountsTableTableManager(_db, _db.accounts);
  $$CategoryGroupsTableTableManager get categoryGroups =>
      $$CategoryGroupsTableTableManager(_db, _db.categoryGroups);
  $$CategoriesTableTableManager get categories =>
      $$CategoriesTableTableManager(_db, _db.categories);
  $$PayeesTableTableManager get payees =>
      $$PayeesTableTableManager(_db, _db.payees);
  $$TransactionsTableTableManager get transactions =>
      $$TransactionsTableTableManager(_db, _db.transactions);
  $$TagsTableTableManager get tags => $$TagsTableTableManager(_db, _db.tags);
  $$TransactionTagsTableTableManager get transactionTags =>
      $$TransactionTagsTableTableManager(_db, _db.transactionTags);
  $$RulesTableTableManager get rules =>
      $$RulesTableTableManager(_db, _db.rules);
  $$RuleMatchesTableTableManager get ruleMatches =>
      $$RuleMatchesTableTableManager(_db, _db.ruleMatches);
  $$BudgetsTableTableManager get budgets =>
      $$BudgetsTableTableManager(_db, _db.budgets);
  $$RecurrencesTableTableManager get recurrences =>
      $$RecurrencesTableTableManager(_db, _db.recurrences);
  $$SmsMessagesTableTableManager get smsMessages =>
      $$SmsMessagesTableTableManager(_db, _db.smsMessages);
  $$SmsParseCacheTableTableManager get smsParseCache =>
      $$SmsParseCacheTableTableManager(_db, _db.smsParseCache);
  $$AppKvTableTableManager get appKv =>
      $$AppKvTableTableManager(_db, _db.appKv);
  $$AuditLogTableTableManager get auditLog =>
      $$AuditLogTableTableManager(_db, _db.auditLog);
  $$ChangeLogTableTableManager get changeLog =>
      $$ChangeLogTableTableManager(_db, _db.changeLog);
}
