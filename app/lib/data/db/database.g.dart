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
  static const VerificationMeta _actualIdMeta = const VerificationMeta(
    'actualId',
  );
  @override
  late final GeneratedColumn<String> actualId = GeneratedColumn<String>(
    'actual_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
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
  static const VerificationMeta _offbudgetMeta = const VerificationMeta(
    'offbudget',
  );
  @override
  late final GeneratedColumn<bool> offbudget = GeneratedColumn<bool>(
    'offbudget',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("offbudget" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _closedMeta = const VerificationMeta('closed');
  @override
  late final GeneratedColumn<bool> closed = GeneratedColumn<bool>(
    'closed',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("closed" IN (0, 1))',
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
  static const VerificationMeta _balanceCentsMeta = const VerificationMeta(
    'balanceCents',
  );
  @override
  late final GeneratedColumn<int> balanceCents = GeneratedColumn<int>(
    'balance_cents',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
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
  static const VerificationMeta _syncStatusMeta = const VerificationMeta(
    'syncStatus',
  );
  @override
  late final GeneratedColumn<String> syncStatus = GeneratedColumn<String>(
    'sync_status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('synced'),
  );
  static const VerificationMeta _syncErrorMeta = const VerificationMeta(
    'syncError',
  );
  @override
  late final GeneratedColumn<String> syncError = GeneratedColumn<String>(
    'sync_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    actualId,
    name,
    offbudget,
    closed,
    sortOrder,
    balanceCents,
    updatedAt,
    syncStatus,
    syncError,
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
    if (data.containsKey('actual_id')) {
      context.handle(
        _actualIdMeta,
        actualId.isAcceptableOrUnknown(data['actual_id']!, _actualIdMeta),
      );
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('offbudget')) {
      context.handle(
        _offbudgetMeta,
        offbudget.isAcceptableOrUnknown(data['offbudget']!, _offbudgetMeta),
      );
    }
    if (data.containsKey('closed')) {
      context.handle(
        _closedMeta,
        closed.isAcceptableOrUnknown(data['closed']!, _closedMeta),
      );
    }
    if (data.containsKey('sort_order')) {
      context.handle(
        _sortOrderMeta,
        sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta),
      );
    }
    if (data.containsKey('balance_cents')) {
      context.handle(
        _balanceCentsMeta,
        balanceCents.isAcceptableOrUnknown(
          data['balance_cents']!,
          _balanceCentsMeta,
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
    if (data.containsKey('sync_status')) {
      context.handle(
        _syncStatusMeta,
        syncStatus.isAcceptableOrUnknown(data['sync_status']!, _syncStatusMeta),
      );
    }
    if (data.containsKey('sync_error')) {
      context.handle(
        _syncErrorMeta,
        syncError.isAcceptableOrUnknown(data['sync_error']!, _syncErrorMeta),
      );
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
      actualId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}actual_id'],
      ),
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      offbudget: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}offbudget'],
      )!,
      closed: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}closed'],
      )!,
      sortOrder: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sort_order'],
      )!,
      balanceCents: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}balance_cents'],
      ),
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
      syncStatus: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync_status'],
      )!,
      syncError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync_error'],
      ),
    );
  }

  @override
  $AccountsTable createAlias(String alias) {
    return $AccountsTable(attachedDatabase, alias);
  }
}

class AccountRow extends DataClass implements Insertable<AccountRow> {
  final String id;
  final String? actualId;
  final String name;
  final bool offbudget;
  final bool closed;
  final int sortOrder;
  final int? balanceCents;
  final int updatedAt;
  final String syncStatus;
  final String? syncError;
  const AccountRow({
    required this.id,
    this.actualId,
    required this.name,
    required this.offbudget,
    required this.closed,
    required this.sortOrder,
    this.balanceCents,
    required this.updatedAt,
    required this.syncStatus,
    this.syncError,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || actualId != null) {
      map['actual_id'] = Variable<String>(actualId);
    }
    map['name'] = Variable<String>(name);
    map['offbudget'] = Variable<bool>(offbudget);
    map['closed'] = Variable<bool>(closed);
    map['sort_order'] = Variable<int>(sortOrder);
    if (!nullToAbsent || balanceCents != null) {
      map['balance_cents'] = Variable<int>(balanceCents);
    }
    map['updated_at'] = Variable<int>(updatedAt);
    map['sync_status'] = Variable<String>(syncStatus);
    if (!nullToAbsent || syncError != null) {
      map['sync_error'] = Variable<String>(syncError);
    }
    return map;
  }

  AccountsCompanion toCompanion(bool nullToAbsent) {
    return AccountsCompanion(
      id: Value(id),
      actualId: actualId == null && nullToAbsent
          ? const Value.absent()
          : Value(actualId),
      name: Value(name),
      offbudget: Value(offbudget),
      closed: Value(closed),
      sortOrder: Value(sortOrder),
      balanceCents: balanceCents == null && nullToAbsent
          ? const Value.absent()
          : Value(balanceCents),
      updatedAt: Value(updatedAt),
      syncStatus: Value(syncStatus),
      syncError: syncError == null && nullToAbsent
          ? const Value.absent()
          : Value(syncError),
    );
  }

  factory AccountRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return AccountRow(
      id: serializer.fromJson<String>(json['id']),
      actualId: serializer.fromJson<String?>(json['actualId']),
      name: serializer.fromJson<String>(json['name']),
      offbudget: serializer.fromJson<bool>(json['offbudget']),
      closed: serializer.fromJson<bool>(json['closed']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
      balanceCents: serializer.fromJson<int?>(json['balanceCents']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
      syncStatus: serializer.fromJson<String>(json['syncStatus']),
      syncError: serializer.fromJson<String?>(json['syncError']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'actualId': serializer.toJson<String?>(actualId),
      'name': serializer.toJson<String>(name),
      'offbudget': serializer.toJson<bool>(offbudget),
      'closed': serializer.toJson<bool>(closed),
      'sortOrder': serializer.toJson<int>(sortOrder),
      'balanceCents': serializer.toJson<int?>(balanceCents),
      'updatedAt': serializer.toJson<int>(updatedAt),
      'syncStatus': serializer.toJson<String>(syncStatus),
      'syncError': serializer.toJson<String?>(syncError),
    };
  }

  AccountRow copyWith({
    String? id,
    Value<String?> actualId = const Value.absent(),
    String? name,
    bool? offbudget,
    bool? closed,
    int? sortOrder,
    Value<int?> balanceCents = const Value.absent(),
    int? updatedAt,
    String? syncStatus,
    Value<String?> syncError = const Value.absent(),
  }) => AccountRow(
    id: id ?? this.id,
    actualId: actualId.present ? actualId.value : this.actualId,
    name: name ?? this.name,
    offbudget: offbudget ?? this.offbudget,
    closed: closed ?? this.closed,
    sortOrder: sortOrder ?? this.sortOrder,
    balanceCents: balanceCents.present ? balanceCents.value : this.balanceCents,
    updatedAt: updatedAt ?? this.updatedAt,
    syncStatus: syncStatus ?? this.syncStatus,
    syncError: syncError.present ? syncError.value : this.syncError,
  );
  AccountRow copyWithCompanion(AccountsCompanion data) {
    return AccountRow(
      id: data.id.present ? data.id.value : this.id,
      actualId: data.actualId.present ? data.actualId.value : this.actualId,
      name: data.name.present ? data.name.value : this.name,
      offbudget: data.offbudget.present ? data.offbudget.value : this.offbudget,
      closed: data.closed.present ? data.closed.value : this.closed,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
      balanceCents: data.balanceCents.present
          ? data.balanceCents.value
          : this.balanceCents,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      syncStatus: data.syncStatus.present
          ? data.syncStatus.value
          : this.syncStatus,
      syncError: data.syncError.present ? data.syncError.value : this.syncError,
    );
  }

  @override
  String toString() {
    return (StringBuffer('AccountRow(')
          ..write('id: $id, ')
          ..write('actualId: $actualId, ')
          ..write('name: $name, ')
          ..write('offbudget: $offbudget, ')
          ..write('closed: $closed, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('balanceCents: $balanceCents, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('syncStatus: $syncStatus, ')
          ..write('syncError: $syncError')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    actualId,
    name,
    offbudget,
    closed,
    sortOrder,
    balanceCents,
    updatedAt,
    syncStatus,
    syncError,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is AccountRow &&
          other.id == this.id &&
          other.actualId == this.actualId &&
          other.name == this.name &&
          other.offbudget == this.offbudget &&
          other.closed == this.closed &&
          other.sortOrder == this.sortOrder &&
          other.balanceCents == this.balanceCents &&
          other.updatedAt == this.updatedAt &&
          other.syncStatus == this.syncStatus &&
          other.syncError == this.syncError);
}

class AccountsCompanion extends UpdateCompanion<AccountRow> {
  final Value<String> id;
  final Value<String?> actualId;
  final Value<String> name;
  final Value<bool> offbudget;
  final Value<bool> closed;
  final Value<int> sortOrder;
  final Value<int?> balanceCents;
  final Value<int> updatedAt;
  final Value<String> syncStatus;
  final Value<String?> syncError;
  final Value<int> rowid;
  const AccountsCompanion({
    this.id = const Value.absent(),
    this.actualId = const Value.absent(),
    this.name = const Value.absent(),
    this.offbudget = const Value.absent(),
    this.closed = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.balanceCents = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.syncStatus = const Value.absent(),
    this.syncError = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AccountsCompanion.insert({
    required String id,
    this.actualId = const Value.absent(),
    required String name,
    this.offbudget = const Value.absent(),
    this.closed = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.balanceCents = const Value.absent(),
    required int updatedAt,
    this.syncStatus = const Value.absent(),
    this.syncError = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       updatedAt = Value(updatedAt);
  static Insertable<AccountRow> custom({
    Expression<String>? id,
    Expression<String>? actualId,
    Expression<String>? name,
    Expression<bool>? offbudget,
    Expression<bool>? closed,
    Expression<int>? sortOrder,
    Expression<int>? balanceCents,
    Expression<int>? updatedAt,
    Expression<String>? syncStatus,
    Expression<String>? syncError,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (actualId != null) 'actual_id': actualId,
      if (name != null) 'name': name,
      if (offbudget != null) 'offbudget': offbudget,
      if (closed != null) 'closed': closed,
      if (sortOrder != null) 'sort_order': sortOrder,
      if (balanceCents != null) 'balance_cents': balanceCents,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (syncStatus != null) 'sync_status': syncStatus,
      if (syncError != null) 'sync_error': syncError,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AccountsCompanion copyWith({
    Value<String>? id,
    Value<String?>? actualId,
    Value<String>? name,
    Value<bool>? offbudget,
    Value<bool>? closed,
    Value<int>? sortOrder,
    Value<int?>? balanceCents,
    Value<int>? updatedAt,
    Value<String>? syncStatus,
    Value<String?>? syncError,
    Value<int>? rowid,
  }) {
    return AccountsCompanion(
      id: id ?? this.id,
      actualId: actualId ?? this.actualId,
      name: name ?? this.name,
      offbudget: offbudget ?? this.offbudget,
      closed: closed ?? this.closed,
      sortOrder: sortOrder ?? this.sortOrder,
      balanceCents: balanceCents ?? this.balanceCents,
      updatedAt: updatedAt ?? this.updatedAt,
      syncStatus: syncStatus ?? this.syncStatus,
      syncError: syncError ?? this.syncError,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (actualId.present) {
      map['actual_id'] = Variable<String>(actualId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (offbudget.present) {
      map['offbudget'] = Variable<bool>(offbudget.value);
    }
    if (closed.present) {
      map['closed'] = Variable<bool>(closed.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<int>(sortOrder.value);
    }
    if (balanceCents.present) {
      map['balance_cents'] = Variable<int>(balanceCents.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (syncStatus.present) {
      map['sync_status'] = Variable<String>(syncStatus.value);
    }
    if (syncError.present) {
      map['sync_error'] = Variable<String>(syncError.value);
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
          ..write('actualId: $actualId, ')
          ..write('name: $name, ')
          ..write('offbudget: $offbudget, ')
          ..write('closed: $closed, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('balanceCents: $balanceCents, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('syncStatus: $syncStatus, ')
          ..write('syncError: $syncError, ')
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
  static const VerificationMeta _actualIdMeta = const VerificationMeta(
    'actualId',
  );
  @override
  late final GeneratedColumn<String> actualId = GeneratedColumn<String>(
    'actual_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
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
  List<GeneratedColumn> get $columns => [
    id,
    actualId,
    name,
    isIncome,
    sortOrder,
  ];
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
    if (data.containsKey('actual_id')) {
      context.handle(
        _actualIdMeta,
        actualId.isAcceptableOrUnknown(data['actual_id']!, _actualIdMeta),
      );
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
      actualId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}actual_id'],
      ),
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
  final String? actualId;
  final String name;
  final bool isIncome;
  final int sortOrder;
  const CategoryGroupRow({
    required this.id,
    this.actualId,
    required this.name,
    required this.isIncome,
    required this.sortOrder,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || actualId != null) {
      map['actual_id'] = Variable<String>(actualId);
    }
    map['name'] = Variable<String>(name);
    map['is_income'] = Variable<bool>(isIncome);
    map['sort_order'] = Variable<int>(sortOrder);
    return map;
  }

  CategoryGroupsCompanion toCompanion(bool nullToAbsent) {
    return CategoryGroupsCompanion(
      id: Value(id),
      actualId: actualId == null && nullToAbsent
          ? const Value.absent()
          : Value(actualId),
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
      actualId: serializer.fromJson<String?>(json['actualId']),
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
      'actualId': serializer.toJson<String?>(actualId),
      'name': serializer.toJson<String>(name),
      'isIncome': serializer.toJson<bool>(isIncome),
      'sortOrder': serializer.toJson<int>(sortOrder),
    };
  }

  CategoryGroupRow copyWith({
    String? id,
    Value<String?> actualId = const Value.absent(),
    String? name,
    bool? isIncome,
    int? sortOrder,
  }) => CategoryGroupRow(
    id: id ?? this.id,
    actualId: actualId.present ? actualId.value : this.actualId,
    name: name ?? this.name,
    isIncome: isIncome ?? this.isIncome,
    sortOrder: sortOrder ?? this.sortOrder,
  );
  CategoryGroupRow copyWithCompanion(CategoryGroupsCompanion data) {
    return CategoryGroupRow(
      id: data.id.present ? data.id.value : this.id,
      actualId: data.actualId.present ? data.actualId.value : this.actualId,
      name: data.name.present ? data.name.value : this.name,
      isIncome: data.isIncome.present ? data.isIncome.value : this.isIncome,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CategoryGroupRow(')
          ..write('id: $id, ')
          ..write('actualId: $actualId, ')
          ..write('name: $name, ')
          ..write('isIncome: $isIncome, ')
          ..write('sortOrder: $sortOrder')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, actualId, name, isIncome, sortOrder);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CategoryGroupRow &&
          other.id == this.id &&
          other.actualId == this.actualId &&
          other.name == this.name &&
          other.isIncome == this.isIncome &&
          other.sortOrder == this.sortOrder);
}

class CategoryGroupsCompanion extends UpdateCompanion<CategoryGroupRow> {
  final Value<String> id;
  final Value<String?> actualId;
  final Value<String> name;
  final Value<bool> isIncome;
  final Value<int> sortOrder;
  final Value<int> rowid;
  const CategoryGroupsCompanion({
    this.id = const Value.absent(),
    this.actualId = const Value.absent(),
    this.name = const Value.absent(),
    this.isIncome = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CategoryGroupsCompanion.insert({
    required String id,
    this.actualId = const Value.absent(),
    required String name,
    this.isIncome = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name);
  static Insertable<CategoryGroupRow> custom({
    Expression<String>? id,
    Expression<String>? actualId,
    Expression<String>? name,
    Expression<bool>? isIncome,
    Expression<int>? sortOrder,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (actualId != null) 'actual_id': actualId,
      if (name != null) 'name': name,
      if (isIncome != null) 'is_income': isIncome,
      if (sortOrder != null) 'sort_order': sortOrder,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CategoryGroupsCompanion copyWith({
    Value<String>? id,
    Value<String?>? actualId,
    Value<String>? name,
    Value<bool>? isIncome,
    Value<int>? sortOrder,
    Value<int>? rowid,
  }) {
    return CategoryGroupsCompanion(
      id: id ?? this.id,
      actualId: actualId ?? this.actualId,
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
    if (actualId.present) {
      map['actual_id'] = Variable<String>(actualId.value);
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
          ..write('actualId: $actualId, ')
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
  static const VerificationMeta _actualIdMeta = const VerificationMeta(
    'actualId',
  );
  @override
  late final GeneratedColumn<String> actualId = GeneratedColumn<String>(
    'actual_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
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
  static const VerificationMeta _syncStatusMeta = const VerificationMeta(
    'syncStatus',
  );
  @override
  late final GeneratedColumn<String> syncStatus = GeneratedColumn<String>(
    'sync_status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('synced'),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    actualId,
    name,
    groupId,
    isIncome,
    hidden,
    sortOrder,
    updatedAt,
    syncStatus,
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
    if (data.containsKey('actual_id')) {
      context.handle(
        _actualIdMeta,
        actualId.isAcceptableOrUnknown(data['actual_id']!, _actualIdMeta),
      );
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
    if (data.containsKey('is_income')) {
      context.handle(
        _isIncomeMeta,
        isIncome.isAcceptableOrUnknown(data['is_income']!, _isIncomeMeta),
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
    if (data.containsKey('sync_status')) {
      context.handle(
        _syncStatusMeta,
        syncStatus.isAcceptableOrUnknown(data['sync_status']!, _syncStatusMeta),
      );
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
      actualId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}actual_id'],
      ),
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      groupId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}group_id'],
      )!,
      isIncome: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_income'],
      )!,
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
      syncStatus: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync_status'],
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
  final String? actualId;
  final String name;
  final String groupId;
  final bool isIncome;
  final bool hidden;
  final int sortOrder;
  final int updatedAt;
  final String syncStatus;
  const CategoryRow({
    required this.id,
    this.actualId,
    required this.name,
    required this.groupId,
    required this.isIncome,
    required this.hidden,
    required this.sortOrder,
    required this.updatedAt,
    required this.syncStatus,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || actualId != null) {
      map['actual_id'] = Variable<String>(actualId);
    }
    map['name'] = Variable<String>(name);
    map['group_id'] = Variable<String>(groupId);
    map['is_income'] = Variable<bool>(isIncome);
    map['hidden'] = Variable<bool>(hidden);
    map['sort_order'] = Variable<int>(sortOrder);
    map['updated_at'] = Variable<int>(updatedAt);
    map['sync_status'] = Variable<String>(syncStatus);
    return map;
  }

  CategoriesCompanion toCompanion(bool nullToAbsent) {
    return CategoriesCompanion(
      id: Value(id),
      actualId: actualId == null && nullToAbsent
          ? const Value.absent()
          : Value(actualId),
      name: Value(name),
      groupId: Value(groupId),
      isIncome: Value(isIncome),
      hidden: Value(hidden),
      sortOrder: Value(sortOrder),
      updatedAt: Value(updatedAt),
      syncStatus: Value(syncStatus),
    );
  }

  factory CategoryRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CategoryRow(
      id: serializer.fromJson<String>(json['id']),
      actualId: serializer.fromJson<String?>(json['actualId']),
      name: serializer.fromJson<String>(json['name']),
      groupId: serializer.fromJson<String>(json['groupId']),
      isIncome: serializer.fromJson<bool>(json['isIncome']),
      hidden: serializer.fromJson<bool>(json['hidden']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
      syncStatus: serializer.fromJson<String>(json['syncStatus']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'actualId': serializer.toJson<String?>(actualId),
      'name': serializer.toJson<String>(name),
      'groupId': serializer.toJson<String>(groupId),
      'isIncome': serializer.toJson<bool>(isIncome),
      'hidden': serializer.toJson<bool>(hidden),
      'sortOrder': serializer.toJson<int>(sortOrder),
      'updatedAt': serializer.toJson<int>(updatedAt),
      'syncStatus': serializer.toJson<String>(syncStatus),
    };
  }

  CategoryRow copyWith({
    String? id,
    Value<String?> actualId = const Value.absent(),
    String? name,
    String? groupId,
    bool? isIncome,
    bool? hidden,
    int? sortOrder,
    int? updatedAt,
    String? syncStatus,
  }) => CategoryRow(
    id: id ?? this.id,
    actualId: actualId.present ? actualId.value : this.actualId,
    name: name ?? this.name,
    groupId: groupId ?? this.groupId,
    isIncome: isIncome ?? this.isIncome,
    hidden: hidden ?? this.hidden,
    sortOrder: sortOrder ?? this.sortOrder,
    updatedAt: updatedAt ?? this.updatedAt,
    syncStatus: syncStatus ?? this.syncStatus,
  );
  CategoryRow copyWithCompanion(CategoriesCompanion data) {
    return CategoryRow(
      id: data.id.present ? data.id.value : this.id,
      actualId: data.actualId.present ? data.actualId.value : this.actualId,
      name: data.name.present ? data.name.value : this.name,
      groupId: data.groupId.present ? data.groupId.value : this.groupId,
      isIncome: data.isIncome.present ? data.isIncome.value : this.isIncome,
      hidden: data.hidden.present ? data.hidden.value : this.hidden,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      syncStatus: data.syncStatus.present
          ? data.syncStatus.value
          : this.syncStatus,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CategoryRow(')
          ..write('id: $id, ')
          ..write('actualId: $actualId, ')
          ..write('name: $name, ')
          ..write('groupId: $groupId, ')
          ..write('isIncome: $isIncome, ')
          ..write('hidden: $hidden, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('syncStatus: $syncStatus')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    actualId,
    name,
    groupId,
    isIncome,
    hidden,
    sortOrder,
    updatedAt,
    syncStatus,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CategoryRow &&
          other.id == this.id &&
          other.actualId == this.actualId &&
          other.name == this.name &&
          other.groupId == this.groupId &&
          other.isIncome == this.isIncome &&
          other.hidden == this.hidden &&
          other.sortOrder == this.sortOrder &&
          other.updatedAt == this.updatedAt &&
          other.syncStatus == this.syncStatus);
}

class CategoriesCompanion extends UpdateCompanion<CategoryRow> {
  final Value<String> id;
  final Value<String?> actualId;
  final Value<String> name;
  final Value<String> groupId;
  final Value<bool> isIncome;
  final Value<bool> hidden;
  final Value<int> sortOrder;
  final Value<int> updatedAt;
  final Value<String> syncStatus;
  final Value<int> rowid;
  const CategoriesCompanion({
    this.id = const Value.absent(),
    this.actualId = const Value.absent(),
    this.name = const Value.absent(),
    this.groupId = const Value.absent(),
    this.isIncome = const Value.absent(),
    this.hidden = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.syncStatus = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CategoriesCompanion.insert({
    required String id,
    this.actualId = const Value.absent(),
    required String name,
    required String groupId,
    this.isIncome = const Value.absent(),
    this.hidden = const Value.absent(),
    this.sortOrder = const Value.absent(),
    required int updatedAt,
    this.syncStatus = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       groupId = Value(groupId),
       updatedAt = Value(updatedAt);
  static Insertable<CategoryRow> custom({
    Expression<String>? id,
    Expression<String>? actualId,
    Expression<String>? name,
    Expression<String>? groupId,
    Expression<bool>? isIncome,
    Expression<bool>? hidden,
    Expression<int>? sortOrder,
    Expression<int>? updatedAt,
    Expression<String>? syncStatus,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (actualId != null) 'actual_id': actualId,
      if (name != null) 'name': name,
      if (groupId != null) 'group_id': groupId,
      if (isIncome != null) 'is_income': isIncome,
      if (hidden != null) 'hidden': hidden,
      if (sortOrder != null) 'sort_order': sortOrder,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (syncStatus != null) 'sync_status': syncStatus,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CategoriesCompanion copyWith({
    Value<String>? id,
    Value<String?>? actualId,
    Value<String>? name,
    Value<String>? groupId,
    Value<bool>? isIncome,
    Value<bool>? hidden,
    Value<int>? sortOrder,
    Value<int>? updatedAt,
    Value<String>? syncStatus,
    Value<int>? rowid,
  }) {
    return CategoriesCompanion(
      id: id ?? this.id,
      actualId: actualId ?? this.actualId,
      name: name ?? this.name,
      groupId: groupId ?? this.groupId,
      isIncome: isIncome ?? this.isIncome,
      hidden: hidden ?? this.hidden,
      sortOrder: sortOrder ?? this.sortOrder,
      updatedAt: updatedAt ?? this.updatedAt,
      syncStatus: syncStatus ?? this.syncStatus,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (actualId.present) {
      map['actual_id'] = Variable<String>(actualId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (groupId.present) {
      map['group_id'] = Variable<String>(groupId.value);
    }
    if (isIncome.present) {
      map['is_income'] = Variable<bool>(isIncome.value);
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
    if (syncStatus.present) {
      map['sync_status'] = Variable<String>(syncStatus.value);
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
          ..write('actualId: $actualId, ')
          ..write('name: $name, ')
          ..write('groupId: $groupId, ')
          ..write('isIncome: $isIncome, ')
          ..write('hidden: $hidden, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('syncStatus: $syncStatus, ')
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
  static const VerificationMeta _actualIdMeta = const VerificationMeta(
    'actualId',
  );
  @override
  late final GeneratedColumn<String> actualId = GeneratedColumn<String>(
    'actual_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
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
  static const VerificationMeta _transferAcctMeta = const VerificationMeta(
    'transferAcct',
  );
  @override
  late final GeneratedColumn<String> transferAcct = GeneratedColumn<String>(
    'transfer_acct',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
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
  static const VerificationMeta _syncStatusMeta = const VerificationMeta(
    'syncStatus',
  );
  @override
  late final GeneratedColumn<String> syncStatus = GeneratedColumn<String>(
    'sync_status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('synced'),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    actualId,
    name,
    transferAcct,
    useCount,
    updatedAt,
    syncStatus,
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
    if (data.containsKey('actual_id')) {
      context.handle(
        _actualIdMeta,
        actualId.isAcceptableOrUnknown(data['actual_id']!, _actualIdMeta),
      );
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('transfer_acct')) {
      context.handle(
        _transferAcctMeta,
        transferAcct.isAcceptableOrUnknown(
          data['transfer_acct']!,
          _transferAcctMeta,
        ),
      );
    }
    if (data.containsKey('use_count')) {
      context.handle(
        _useCountMeta,
        useCount.isAcceptableOrUnknown(data['use_count']!, _useCountMeta),
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
    if (data.containsKey('sync_status')) {
      context.handle(
        _syncStatusMeta,
        syncStatus.isAcceptableOrUnknown(data['sync_status']!, _syncStatusMeta),
      );
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
      actualId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}actual_id'],
      ),
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      transferAcct: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}transfer_acct'],
      ),
      useCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}use_count'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
      syncStatus: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync_status'],
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
  final String? actualId;
  final String name;
  final String? transferAcct;
  final int useCount;
  final int updatedAt;
  final String syncStatus;
  const PayeeRow({
    required this.id,
    this.actualId,
    required this.name,
    this.transferAcct,
    required this.useCount,
    required this.updatedAt,
    required this.syncStatus,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || actualId != null) {
      map['actual_id'] = Variable<String>(actualId);
    }
    map['name'] = Variable<String>(name);
    if (!nullToAbsent || transferAcct != null) {
      map['transfer_acct'] = Variable<String>(transferAcct);
    }
    map['use_count'] = Variable<int>(useCount);
    map['updated_at'] = Variable<int>(updatedAt);
    map['sync_status'] = Variable<String>(syncStatus);
    return map;
  }

  PayeesCompanion toCompanion(bool nullToAbsent) {
    return PayeesCompanion(
      id: Value(id),
      actualId: actualId == null && nullToAbsent
          ? const Value.absent()
          : Value(actualId),
      name: Value(name),
      transferAcct: transferAcct == null && nullToAbsent
          ? const Value.absent()
          : Value(transferAcct),
      useCount: Value(useCount),
      updatedAt: Value(updatedAt),
      syncStatus: Value(syncStatus),
    );
  }

  factory PayeeRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PayeeRow(
      id: serializer.fromJson<String>(json['id']),
      actualId: serializer.fromJson<String?>(json['actualId']),
      name: serializer.fromJson<String>(json['name']),
      transferAcct: serializer.fromJson<String?>(json['transferAcct']),
      useCount: serializer.fromJson<int>(json['useCount']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
      syncStatus: serializer.fromJson<String>(json['syncStatus']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'actualId': serializer.toJson<String?>(actualId),
      'name': serializer.toJson<String>(name),
      'transferAcct': serializer.toJson<String?>(transferAcct),
      'useCount': serializer.toJson<int>(useCount),
      'updatedAt': serializer.toJson<int>(updatedAt),
      'syncStatus': serializer.toJson<String>(syncStatus),
    };
  }

  PayeeRow copyWith({
    String? id,
    Value<String?> actualId = const Value.absent(),
    String? name,
    Value<String?> transferAcct = const Value.absent(),
    int? useCount,
    int? updatedAt,
    String? syncStatus,
  }) => PayeeRow(
    id: id ?? this.id,
    actualId: actualId.present ? actualId.value : this.actualId,
    name: name ?? this.name,
    transferAcct: transferAcct.present ? transferAcct.value : this.transferAcct,
    useCount: useCount ?? this.useCount,
    updatedAt: updatedAt ?? this.updatedAt,
    syncStatus: syncStatus ?? this.syncStatus,
  );
  PayeeRow copyWithCompanion(PayeesCompanion data) {
    return PayeeRow(
      id: data.id.present ? data.id.value : this.id,
      actualId: data.actualId.present ? data.actualId.value : this.actualId,
      name: data.name.present ? data.name.value : this.name,
      transferAcct: data.transferAcct.present
          ? data.transferAcct.value
          : this.transferAcct,
      useCount: data.useCount.present ? data.useCount.value : this.useCount,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      syncStatus: data.syncStatus.present
          ? data.syncStatus.value
          : this.syncStatus,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PayeeRow(')
          ..write('id: $id, ')
          ..write('actualId: $actualId, ')
          ..write('name: $name, ')
          ..write('transferAcct: $transferAcct, ')
          ..write('useCount: $useCount, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('syncStatus: $syncStatus')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    actualId,
    name,
    transferAcct,
    useCount,
    updatedAt,
    syncStatus,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PayeeRow &&
          other.id == this.id &&
          other.actualId == this.actualId &&
          other.name == this.name &&
          other.transferAcct == this.transferAcct &&
          other.useCount == this.useCount &&
          other.updatedAt == this.updatedAt &&
          other.syncStatus == this.syncStatus);
}

class PayeesCompanion extends UpdateCompanion<PayeeRow> {
  final Value<String> id;
  final Value<String?> actualId;
  final Value<String> name;
  final Value<String?> transferAcct;
  final Value<int> useCount;
  final Value<int> updatedAt;
  final Value<String> syncStatus;
  final Value<int> rowid;
  const PayeesCompanion({
    this.id = const Value.absent(),
    this.actualId = const Value.absent(),
    this.name = const Value.absent(),
    this.transferAcct = const Value.absent(),
    this.useCount = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.syncStatus = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PayeesCompanion.insert({
    required String id,
    this.actualId = const Value.absent(),
    required String name,
    this.transferAcct = const Value.absent(),
    this.useCount = const Value.absent(),
    required int updatedAt,
    this.syncStatus = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       updatedAt = Value(updatedAt);
  static Insertable<PayeeRow> custom({
    Expression<String>? id,
    Expression<String>? actualId,
    Expression<String>? name,
    Expression<String>? transferAcct,
    Expression<int>? useCount,
    Expression<int>? updatedAt,
    Expression<String>? syncStatus,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (actualId != null) 'actual_id': actualId,
      if (name != null) 'name': name,
      if (transferAcct != null) 'transfer_acct': transferAcct,
      if (useCount != null) 'use_count': useCount,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (syncStatus != null) 'sync_status': syncStatus,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PayeesCompanion copyWith({
    Value<String>? id,
    Value<String?>? actualId,
    Value<String>? name,
    Value<String?>? transferAcct,
    Value<int>? useCount,
    Value<int>? updatedAt,
    Value<String>? syncStatus,
    Value<int>? rowid,
  }) {
    return PayeesCompanion(
      id: id ?? this.id,
      actualId: actualId ?? this.actualId,
      name: name ?? this.name,
      transferAcct: transferAcct ?? this.transferAcct,
      useCount: useCount ?? this.useCount,
      updatedAt: updatedAt ?? this.updatedAt,
      syncStatus: syncStatus ?? this.syncStatus,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (actualId.present) {
      map['actual_id'] = Variable<String>(actualId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (transferAcct.present) {
      map['transfer_acct'] = Variable<String>(transferAcct.value);
    }
    if (useCount.present) {
      map['use_count'] = Variable<int>(useCount.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (syncStatus.present) {
      map['sync_status'] = Variable<String>(syncStatus.value);
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
          ..write('actualId: $actualId, ')
          ..write('name: $name, ')
          ..write('transferAcct: $transferAcct, ')
          ..write('useCount: $useCount, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('syncStatus: $syncStatus, ')
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
  static const VerificationMeta _actualIdMeta = const VerificationMeta(
    'actualId',
  );
  @override
  late final GeneratedColumn<String> actualId = GeneratedColumn<String>(
    'actual_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
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
  static const VerificationMeta _deletedAtMeta = const VerificationMeta(
    'deletedAt',
  );
  @override
  late final GeneratedColumn<int> deletedAt = GeneratedColumn<int>(
    'deleted_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _syncStatusMeta = const VerificationMeta(
    'syncStatus',
  );
  @override
  late final GeneratedColumn<String> syncStatus = GeneratedColumn<String>(
    'sync_status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('pending_push'),
  );
  static const VerificationMeta _syncErrorMeta = const VerificationMeta(
    'syncError',
  );
  @override
  late final GeneratedColumn<String> syncError = GeneratedColumn<String>(
    'sync_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    actualId,
    accountId,
    categoryId,
    payeeId,
    payeeName,
    amountCents,
    date,
    notes,
    cleared,
    origin,
    originRef,
    createdAt,
    updatedAt,
    deletedAt,
    syncStatus,
    syncError,
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
    if (data.containsKey('actual_id')) {
      context.handle(
        _actualIdMeta,
        actualId.isAcceptableOrUnknown(data['actual_id']!, _actualIdMeta),
      );
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
    if (data.containsKey('cleared')) {
      context.handle(
        _clearedMeta,
        cleared.isAcceptableOrUnknown(data['cleared']!, _clearedMeta),
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
    if (data.containsKey('deleted_at')) {
      context.handle(
        _deletedAtMeta,
        deletedAt.isAcceptableOrUnknown(data['deleted_at']!, _deletedAtMeta),
      );
    }
    if (data.containsKey('sync_status')) {
      context.handle(
        _syncStatusMeta,
        syncStatus.isAcceptableOrUnknown(data['sync_status']!, _syncStatusMeta),
      );
    }
    if (data.containsKey('sync_error')) {
      context.handle(
        _syncErrorMeta,
        syncError.isAcceptableOrUnknown(data['sync_error']!, _syncErrorMeta),
      );
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
      actualId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}actual_id'],
      ),
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
      cleared: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}cleared'],
      )!,
      origin: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}origin'],
      )!,
      originRef: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}origin_ref'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
      deletedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}deleted_at'],
      ),
      syncStatus: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync_status'],
      )!,
      syncError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}sync_error'],
      ),
    );
  }

  @override
  $TransactionsTable createAlias(String alias) {
    return $TransactionsTable(attachedDatabase, alias);
  }
}

class TransactionRow extends DataClass implements Insertable<TransactionRow> {
  final String id;
  final String? actualId;
  final String accountId;
  final String? categoryId;
  final String? payeeId;
  final String? payeeName;
  final int amountCents;
  final String date;
  final String? notes;
  final bool cleared;
  final String origin;
  final String? originRef;
  final int createdAt;
  final int updatedAt;
  final int? deletedAt;
  final String syncStatus;
  final String? syncError;
  const TransactionRow({
    required this.id,
    this.actualId,
    required this.accountId,
    this.categoryId,
    this.payeeId,
    this.payeeName,
    required this.amountCents,
    required this.date,
    this.notes,
    required this.cleared,
    required this.origin,
    this.originRef,
    required this.createdAt,
    required this.updatedAt,
    this.deletedAt,
    required this.syncStatus,
    this.syncError,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    if (!nullToAbsent || actualId != null) {
      map['actual_id'] = Variable<String>(actualId);
    }
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
    map['cleared'] = Variable<bool>(cleared);
    map['origin'] = Variable<String>(origin);
    if (!nullToAbsent || originRef != null) {
      map['origin_ref'] = Variable<String>(originRef);
    }
    map['created_at'] = Variable<int>(createdAt);
    map['updated_at'] = Variable<int>(updatedAt);
    if (!nullToAbsent || deletedAt != null) {
      map['deleted_at'] = Variable<int>(deletedAt);
    }
    map['sync_status'] = Variable<String>(syncStatus);
    if (!nullToAbsent || syncError != null) {
      map['sync_error'] = Variable<String>(syncError);
    }
    return map;
  }

  TransactionsCompanion toCompanion(bool nullToAbsent) {
    return TransactionsCompanion(
      id: Value(id),
      actualId: actualId == null && nullToAbsent
          ? const Value.absent()
          : Value(actualId),
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
      cleared: Value(cleared),
      origin: Value(origin),
      originRef: originRef == null && nullToAbsent
          ? const Value.absent()
          : Value(originRef),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
      deletedAt: deletedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(deletedAt),
      syncStatus: Value(syncStatus),
      syncError: syncError == null && nullToAbsent
          ? const Value.absent()
          : Value(syncError),
    );
  }

  factory TransactionRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return TransactionRow(
      id: serializer.fromJson<String>(json['id']),
      actualId: serializer.fromJson<String?>(json['actualId']),
      accountId: serializer.fromJson<String>(json['accountId']),
      categoryId: serializer.fromJson<String?>(json['categoryId']),
      payeeId: serializer.fromJson<String?>(json['payeeId']),
      payeeName: serializer.fromJson<String?>(json['payeeName']),
      amountCents: serializer.fromJson<int>(json['amountCents']),
      date: serializer.fromJson<String>(json['date']),
      notes: serializer.fromJson<String?>(json['notes']),
      cleared: serializer.fromJson<bool>(json['cleared']),
      origin: serializer.fromJson<String>(json['origin']),
      originRef: serializer.fromJson<String?>(json['originRef']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
      deletedAt: serializer.fromJson<int?>(json['deletedAt']),
      syncStatus: serializer.fromJson<String>(json['syncStatus']),
      syncError: serializer.fromJson<String?>(json['syncError']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'actualId': serializer.toJson<String?>(actualId),
      'accountId': serializer.toJson<String>(accountId),
      'categoryId': serializer.toJson<String?>(categoryId),
      'payeeId': serializer.toJson<String?>(payeeId),
      'payeeName': serializer.toJson<String?>(payeeName),
      'amountCents': serializer.toJson<int>(amountCents),
      'date': serializer.toJson<String>(date),
      'notes': serializer.toJson<String?>(notes),
      'cleared': serializer.toJson<bool>(cleared),
      'origin': serializer.toJson<String>(origin),
      'originRef': serializer.toJson<String?>(originRef),
      'createdAt': serializer.toJson<int>(createdAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
      'deletedAt': serializer.toJson<int?>(deletedAt),
      'syncStatus': serializer.toJson<String>(syncStatus),
      'syncError': serializer.toJson<String?>(syncError),
    };
  }

  TransactionRow copyWith({
    String? id,
    Value<String?> actualId = const Value.absent(),
    String? accountId,
    Value<String?> categoryId = const Value.absent(),
    Value<String?> payeeId = const Value.absent(),
    Value<String?> payeeName = const Value.absent(),
    int? amountCents,
    String? date,
    Value<String?> notes = const Value.absent(),
    bool? cleared,
    String? origin,
    Value<String?> originRef = const Value.absent(),
    int? createdAt,
    int? updatedAt,
    Value<int?> deletedAt = const Value.absent(),
    String? syncStatus,
    Value<String?> syncError = const Value.absent(),
  }) => TransactionRow(
    id: id ?? this.id,
    actualId: actualId.present ? actualId.value : this.actualId,
    accountId: accountId ?? this.accountId,
    categoryId: categoryId.present ? categoryId.value : this.categoryId,
    payeeId: payeeId.present ? payeeId.value : this.payeeId,
    payeeName: payeeName.present ? payeeName.value : this.payeeName,
    amountCents: amountCents ?? this.amountCents,
    date: date ?? this.date,
    notes: notes.present ? notes.value : this.notes,
    cleared: cleared ?? this.cleared,
    origin: origin ?? this.origin,
    originRef: originRef.present ? originRef.value : this.originRef,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
    deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
    syncStatus: syncStatus ?? this.syncStatus,
    syncError: syncError.present ? syncError.value : this.syncError,
  );
  TransactionRow copyWithCompanion(TransactionsCompanion data) {
    return TransactionRow(
      id: data.id.present ? data.id.value : this.id,
      actualId: data.actualId.present ? data.actualId.value : this.actualId,
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
      cleared: data.cleared.present ? data.cleared.value : this.cleared,
      origin: data.origin.present ? data.origin.value : this.origin,
      originRef: data.originRef.present ? data.originRef.value : this.originRef,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      deletedAt: data.deletedAt.present ? data.deletedAt.value : this.deletedAt,
      syncStatus: data.syncStatus.present
          ? data.syncStatus.value
          : this.syncStatus,
      syncError: data.syncError.present ? data.syncError.value : this.syncError,
    );
  }

  @override
  String toString() {
    return (StringBuffer('TransactionRow(')
          ..write('id: $id, ')
          ..write('actualId: $actualId, ')
          ..write('accountId: $accountId, ')
          ..write('categoryId: $categoryId, ')
          ..write('payeeId: $payeeId, ')
          ..write('payeeName: $payeeName, ')
          ..write('amountCents: $amountCents, ')
          ..write('date: $date, ')
          ..write('notes: $notes, ')
          ..write('cleared: $cleared, ')
          ..write('origin: $origin, ')
          ..write('originRef: $originRef, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('syncStatus: $syncStatus, ')
          ..write('syncError: $syncError')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    actualId,
    accountId,
    categoryId,
    payeeId,
    payeeName,
    amountCents,
    date,
    notes,
    cleared,
    origin,
    originRef,
    createdAt,
    updatedAt,
    deletedAt,
    syncStatus,
    syncError,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is TransactionRow &&
          other.id == this.id &&
          other.actualId == this.actualId &&
          other.accountId == this.accountId &&
          other.categoryId == this.categoryId &&
          other.payeeId == this.payeeId &&
          other.payeeName == this.payeeName &&
          other.amountCents == this.amountCents &&
          other.date == this.date &&
          other.notes == this.notes &&
          other.cleared == this.cleared &&
          other.origin == this.origin &&
          other.originRef == this.originRef &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt &&
          other.deletedAt == this.deletedAt &&
          other.syncStatus == this.syncStatus &&
          other.syncError == this.syncError);
}

class TransactionsCompanion extends UpdateCompanion<TransactionRow> {
  final Value<String> id;
  final Value<String?> actualId;
  final Value<String> accountId;
  final Value<String?> categoryId;
  final Value<String?> payeeId;
  final Value<String?> payeeName;
  final Value<int> amountCents;
  final Value<String> date;
  final Value<String?> notes;
  final Value<bool> cleared;
  final Value<String> origin;
  final Value<String?> originRef;
  final Value<int> createdAt;
  final Value<int> updatedAt;
  final Value<int?> deletedAt;
  final Value<String> syncStatus;
  final Value<String?> syncError;
  final Value<int> rowid;
  const TransactionsCompanion({
    this.id = const Value.absent(),
    this.actualId = const Value.absent(),
    this.accountId = const Value.absent(),
    this.categoryId = const Value.absent(),
    this.payeeId = const Value.absent(),
    this.payeeName = const Value.absent(),
    this.amountCents = const Value.absent(),
    this.date = const Value.absent(),
    this.notes = const Value.absent(),
    this.cleared = const Value.absent(),
    this.origin = const Value.absent(),
    this.originRef = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.syncStatus = const Value.absent(),
    this.syncError = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  TransactionsCompanion.insert({
    required String id,
    this.actualId = const Value.absent(),
    required String accountId,
    this.categoryId = const Value.absent(),
    this.payeeId = const Value.absent(),
    this.payeeName = const Value.absent(),
    required int amountCents,
    required String date,
    this.notes = const Value.absent(),
    this.cleared = const Value.absent(),
    this.origin = const Value.absent(),
    this.originRef = const Value.absent(),
    required int createdAt,
    required int updatedAt,
    this.deletedAt = const Value.absent(),
    this.syncStatus = const Value.absent(),
    this.syncError = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       accountId = Value(accountId),
       amountCents = Value(amountCents),
       date = Value(date),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<TransactionRow> custom({
    Expression<String>? id,
    Expression<String>? actualId,
    Expression<String>? accountId,
    Expression<String>? categoryId,
    Expression<String>? payeeId,
    Expression<String>? payeeName,
    Expression<int>? amountCents,
    Expression<String>? date,
    Expression<String>? notes,
    Expression<bool>? cleared,
    Expression<String>? origin,
    Expression<String>? originRef,
    Expression<int>? createdAt,
    Expression<int>? updatedAt,
    Expression<int>? deletedAt,
    Expression<String>? syncStatus,
    Expression<String>? syncError,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (actualId != null) 'actual_id': actualId,
      if (accountId != null) 'account_id': accountId,
      if (categoryId != null) 'category_id': categoryId,
      if (payeeId != null) 'payee_id': payeeId,
      if (payeeName != null) 'payee_name': payeeName,
      if (amountCents != null) 'amount_cents': amountCents,
      if (date != null) 'date': date,
      if (notes != null) 'notes': notes,
      if (cleared != null) 'cleared': cleared,
      if (origin != null) 'origin': origin,
      if (originRef != null) 'origin_ref': originRef,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (deletedAt != null) 'deleted_at': deletedAt,
      if (syncStatus != null) 'sync_status': syncStatus,
      if (syncError != null) 'sync_error': syncError,
      if (rowid != null) 'rowid': rowid,
    });
  }

  TransactionsCompanion copyWith({
    Value<String>? id,
    Value<String?>? actualId,
    Value<String>? accountId,
    Value<String?>? categoryId,
    Value<String?>? payeeId,
    Value<String?>? payeeName,
    Value<int>? amountCents,
    Value<String>? date,
    Value<String?>? notes,
    Value<bool>? cleared,
    Value<String>? origin,
    Value<String?>? originRef,
    Value<int>? createdAt,
    Value<int>? updatedAt,
    Value<int?>? deletedAt,
    Value<String>? syncStatus,
    Value<String?>? syncError,
    Value<int>? rowid,
  }) {
    return TransactionsCompanion(
      id: id ?? this.id,
      actualId: actualId ?? this.actualId,
      accountId: accountId ?? this.accountId,
      categoryId: categoryId ?? this.categoryId,
      payeeId: payeeId ?? this.payeeId,
      payeeName: payeeName ?? this.payeeName,
      amountCents: amountCents ?? this.amountCents,
      date: date ?? this.date,
      notes: notes ?? this.notes,
      cleared: cleared ?? this.cleared,
      origin: origin ?? this.origin,
      originRef: originRef ?? this.originRef,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      deletedAt: deletedAt ?? this.deletedAt,
      syncStatus: syncStatus ?? this.syncStatus,
      syncError: syncError ?? this.syncError,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (actualId.present) {
      map['actual_id'] = Variable<String>(actualId.value);
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
    if (cleared.present) {
      map['cleared'] = Variable<bool>(cleared.value);
    }
    if (origin.present) {
      map['origin'] = Variable<String>(origin.value);
    }
    if (originRef.present) {
      map['origin_ref'] = Variable<String>(originRef.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (deletedAt.present) {
      map['deleted_at'] = Variable<int>(deletedAt.value);
    }
    if (syncStatus.present) {
      map['sync_status'] = Variable<String>(syncStatus.value);
    }
    if (syncError.present) {
      map['sync_error'] = Variable<String>(syncError.value);
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
          ..write('actualId: $actualId, ')
          ..write('accountId: $accountId, ')
          ..write('categoryId: $categoryId, ')
          ..write('payeeId: $payeeId, ')
          ..write('payeeName: $payeeName, ')
          ..write('amountCents: $amountCents, ')
          ..write('date: $date, ')
          ..write('notes: $notes, ')
          ..write('cleared: $cleared, ')
          ..write('origin: $origin, ')
          ..write('originRef: $originRef, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('syncStatus: $syncStatus, ')
          ..write('syncError: $syncError, ')
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
          ..write('linkedTransactionId: $linkedTransactionId')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
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
  );
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
          other.linkedTransactionId == this.linkedTransactionId);
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
          ..write('linkedTransactionId: $linkedTransactionId')
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

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $AccountsTable accounts = $AccountsTable(this);
  late final $CategoryGroupsTable categoryGroups = $CategoryGroupsTable(this);
  late final $CategoriesTable categories = $CategoriesTable(this);
  late final $PayeesTable payees = $PayeesTable(this);
  late final $TransactionsTable transactions = $TransactionsTable(this);
  late final $SmsMessagesTable smsMessages = $SmsMessagesTable(this);
  late final $AppKvTable appKv = $AppKvTable(this);
  late final $AuditLogTable auditLog = $AuditLogTable(this);
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
    smsMessages,
    appKv,
    auditLog,
  ];
}

typedef $$AccountsTableCreateCompanionBuilder =
    AccountsCompanion Function({
      required String id,
      Value<String?> actualId,
      required String name,
      Value<bool> offbudget,
      Value<bool> closed,
      Value<int> sortOrder,
      Value<int?> balanceCents,
      required int updatedAt,
      Value<String> syncStatus,
      Value<String?> syncError,
      Value<int> rowid,
    });
typedef $$AccountsTableUpdateCompanionBuilder =
    AccountsCompanion Function({
      Value<String> id,
      Value<String?> actualId,
      Value<String> name,
      Value<bool> offbudget,
      Value<bool> closed,
      Value<int> sortOrder,
      Value<int?> balanceCents,
      Value<int> updatedAt,
      Value<String> syncStatus,
      Value<String?> syncError,
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

  ColumnFilters<String> get actualId => $composableBuilder(
    column: $table.actualId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get offbudget => $composableBuilder(
    column: $table.offbudget,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get closed => $composableBuilder(
    column: $table.closed,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get balanceCents => $composableBuilder(
    column: $table.balanceCents,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get syncError => $composableBuilder(
    column: $table.syncError,
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

  ColumnOrderings<String> get actualId => $composableBuilder(
    column: $table.actualId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get offbudget => $composableBuilder(
    column: $table.offbudget,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get closed => $composableBuilder(
    column: $table.closed,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get balanceCents => $composableBuilder(
    column: $table.balanceCents,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get syncError => $composableBuilder(
    column: $table.syncError,
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

  GeneratedColumn<String> get actualId =>
      $composableBuilder(column: $table.actualId, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<bool> get offbudget =>
      $composableBuilder(column: $table.offbudget, builder: (column) => column);

  GeneratedColumn<bool> get closed =>
      $composableBuilder(column: $table.closed, builder: (column) => column);

  GeneratedColumn<int> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => column);

  GeneratedColumn<int> get balanceCents => $composableBuilder(
    column: $table.balanceCents,
    builder: (column) => column,
  );

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
    builder: (column) => column,
  );

  GeneratedColumn<String> get syncError =>
      $composableBuilder(column: $table.syncError, builder: (column) => column);
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
                Value<String?> actualId = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<bool> offbudget = const Value.absent(),
                Value<bool> closed = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<int?> balanceCents = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<String> syncStatus = const Value.absent(),
                Value<String?> syncError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => AccountsCompanion(
                id: id,
                actualId: actualId,
                name: name,
                offbudget: offbudget,
                closed: closed,
                sortOrder: sortOrder,
                balanceCents: balanceCents,
                updatedAt: updatedAt,
                syncStatus: syncStatus,
                syncError: syncError,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String?> actualId = const Value.absent(),
                required String name,
                Value<bool> offbudget = const Value.absent(),
                Value<bool> closed = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<int?> balanceCents = const Value.absent(),
                required int updatedAt,
                Value<String> syncStatus = const Value.absent(),
                Value<String?> syncError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => AccountsCompanion.insert(
                id: id,
                actualId: actualId,
                name: name,
                offbudget: offbudget,
                closed: closed,
                sortOrder: sortOrder,
                balanceCents: balanceCents,
                updatedAt: updatedAt,
                syncStatus: syncStatus,
                syncError: syncError,
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
      Value<String?> actualId,
      required String name,
      Value<bool> isIncome,
      Value<int> sortOrder,
      Value<int> rowid,
    });
typedef $$CategoryGroupsTableUpdateCompanionBuilder =
    CategoryGroupsCompanion Function({
      Value<String> id,
      Value<String?> actualId,
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

  ColumnFilters<String> get actualId => $composableBuilder(
    column: $table.actualId,
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

  ColumnOrderings<String> get actualId => $composableBuilder(
    column: $table.actualId,
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

  GeneratedColumn<String> get actualId =>
      $composableBuilder(column: $table.actualId, builder: (column) => column);

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
                Value<String?> actualId = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<bool> isIncome = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CategoryGroupsCompanion(
                id: id,
                actualId: actualId,
                name: name,
                isIncome: isIncome,
                sortOrder: sortOrder,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String?> actualId = const Value.absent(),
                required String name,
                Value<bool> isIncome = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CategoryGroupsCompanion.insert(
                id: id,
                actualId: actualId,
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
      Value<String?> actualId,
      required String name,
      required String groupId,
      Value<bool> isIncome,
      Value<bool> hidden,
      Value<int> sortOrder,
      required int updatedAt,
      Value<String> syncStatus,
      Value<int> rowid,
    });
typedef $$CategoriesTableUpdateCompanionBuilder =
    CategoriesCompanion Function({
      Value<String> id,
      Value<String?> actualId,
      Value<String> name,
      Value<String> groupId,
      Value<bool> isIncome,
      Value<bool> hidden,
      Value<int> sortOrder,
      Value<int> updatedAt,
      Value<String> syncStatus,
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

  ColumnFilters<String> get actualId => $composableBuilder(
    column: $table.actualId,
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

  ColumnFilters<bool> get isIncome => $composableBuilder(
    column: $table.isIncome,
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

  ColumnFilters<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
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

  ColumnOrderings<String> get actualId => $composableBuilder(
    column: $table.actualId,
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

  ColumnOrderings<bool> get isIncome => $composableBuilder(
    column: $table.isIncome,
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

  ColumnOrderings<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
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

  GeneratedColumn<String> get actualId =>
      $composableBuilder(column: $table.actualId, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get groupId =>
      $composableBuilder(column: $table.groupId, builder: (column) => column);

  GeneratedColumn<bool> get isIncome =>
      $composableBuilder(column: $table.isIncome, builder: (column) => column);

  GeneratedColumn<bool> get hidden =>
      $composableBuilder(column: $table.hidden, builder: (column) => column);

  GeneratedColumn<int> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
    builder: (column) => column,
  );
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
                Value<String?> actualId = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> groupId = const Value.absent(),
                Value<bool> isIncome = const Value.absent(),
                Value<bool> hidden = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<String> syncStatus = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CategoriesCompanion(
                id: id,
                actualId: actualId,
                name: name,
                groupId: groupId,
                isIncome: isIncome,
                hidden: hidden,
                sortOrder: sortOrder,
                updatedAt: updatedAt,
                syncStatus: syncStatus,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String?> actualId = const Value.absent(),
                required String name,
                required String groupId,
                Value<bool> isIncome = const Value.absent(),
                Value<bool> hidden = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
                required int updatedAt,
                Value<String> syncStatus = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CategoriesCompanion.insert(
                id: id,
                actualId: actualId,
                name: name,
                groupId: groupId,
                isIncome: isIncome,
                hidden: hidden,
                sortOrder: sortOrder,
                updatedAt: updatedAt,
                syncStatus: syncStatus,
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
      Value<String?> actualId,
      required String name,
      Value<String?> transferAcct,
      Value<int> useCount,
      required int updatedAt,
      Value<String> syncStatus,
      Value<int> rowid,
    });
typedef $$PayeesTableUpdateCompanionBuilder =
    PayeesCompanion Function({
      Value<String> id,
      Value<String?> actualId,
      Value<String> name,
      Value<String?> transferAcct,
      Value<int> useCount,
      Value<int> updatedAt,
      Value<String> syncStatus,
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

  ColumnFilters<String> get actualId => $composableBuilder(
    column: $table.actualId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get transferAcct => $composableBuilder(
    column: $table.transferAcct,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get useCount => $composableBuilder(
    column: $table.useCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
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

  ColumnOrderings<String> get actualId => $composableBuilder(
    column: $table.actualId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get transferAcct => $composableBuilder(
    column: $table.transferAcct,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get useCount => $composableBuilder(
    column: $table.useCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
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

  GeneratedColumn<String> get actualId =>
      $composableBuilder(column: $table.actualId, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get transferAcct => $composableBuilder(
    column: $table.transferAcct,
    builder: (column) => column,
  );

  GeneratedColumn<int> get useCount =>
      $composableBuilder(column: $table.useCount, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
    builder: (column) => column,
  );
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
                Value<String?> actualId = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String?> transferAcct = const Value.absent(),
                Value<int> useCount = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<String> syncStatus = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PayeesCompanion(
                id: id,
                actualId: actualId,
                name: name,
                transferAcct: transferAcct,
                useCount: useCount,
                updatedAt: updatedAt,
                syncStatus: syncStatus,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String?> actualId = const Value.absent(),
                required String name,
                Value<String?> transferAcct = const Value.absent(),
                Value<int> useCount = const Value.absent(),
                required int updatedAt,
                Value<String> syncStatus = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PayeesCompanion.insert(
                id: id,
                actualId: actualId,
                name: name,
                transferAcct: transferAcct,
                useCount: useCount,
                updatedAt: updatedAt,
                syncStatus: syncStatus,
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
      Value<String?> actualId,
      required String accountId,
      Value<String?> categoryId,
      Value<String?> payeeId,
      Value<String?> payeeName,
      required int amountCents,
      required String date,
      Value<String?> notes,
      Value<bool> cleared,
      Value<String> origin,
      Value<String?> originRef,
      required int createdAt,
      required int updatedAt,
      Value<int?> deletedAt,
      Value<String> syncStatus,
      Value<String?> syncError,
      Value<int> rowid,
    });
typedef $$TransactionsTableUpdateCompanionBuilder =
    TransactionsCompanion Function({
      Value<String> id,
      Value<String?> actualId,
      Value<String> accountId,
      Value<String?> categoryId,
      Value<String?> payeeId,
      Value<String?> payeeName,
      Value<int> amountCents,
      Value<String> date,
      Value<String?> notes,
      Value<bool> cleared,
      Value<String> origin,
      Value<String?> originRef,
      Value<int> createdAt,
      Value<int> updatedAt,
      Value<int?> deletedAt,
      Value<String> syncStatus,
      Value<String?> syncError,
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

  ColumnFilters<String> get actualId => $composableBuilder(
    column: $table.actualId,
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

  ColumnFilters<bool> get cleared => $composableBuilder(
    column: $table.cleared,
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

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get deletedAt => $composableBuilder(
    column: $table.deletedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get syncError => $composableBuilder(
    column: $table.syncError,
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

  ColumnOrderings<String> get actualId => $composableBuilder(
    column: $table.actualId,
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

  ColumnOrderings<bool> get cleared => $composableBuilder(
    column: $table.cleared,
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

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get deletedAt => $composableBuilder(
    column: $table.deletedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get syncError => $composableBuilder(
    column: $table.syncError,
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

  GeneratedColumn<String> get actualId =>
      $composableBuilder(column: $table.actualId, builder: (column) => column);

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

  GeneratedColumn<bool> get cleared =>
      $composableBuilder(column: $table.cleared, builder: (column) => column);

  GeneratedColumn<String> get origin =>
      $composableBuilder(column: $table.origin, builder: (column) => column);

  GeneratedColumn<String> get originRef =>
      $composableBuilder(column: $table.originRef, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<int> get deletedAt =>
      $composableBuilder(column: $table.deletedAt, builder: (column) => column);

  GeneratedColumn<String> get syncStatus => $composableBuilder(
    column: $table.syncStatus,
    builder: (column) => column,
  );

  GeneratedColumn<String> get syncError =>
      $composableBuilder(column: $table.syncError, builder: (column) => column);
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
                Value<String?> actualId = const Value.absent(),
                Value<String> accountId = const Value.absent(),
                Value<String?> categoryId = const Value.absent(),
                Value<String?> payeeId = const Value.absent(),
                Value<String?> payeeName = const Value.absent(),
                Value<int> amountCents = const Value.absent(),
                Value<String> date = const Value.absent(),
                Value<String?> notes = const Value.absent(),
                Value<bool> cleared = const Value.absent(),
                Value<String> origin = const Value.absent(),
                Value<String?> originRef = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int?> deletedAt = const Value.absent(),
                Value<String> syncStatus = const Value.absent(),
                Value<String?> syncError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => TransactionsCompanion(
                id: id,
                actualId: actualId,
                accountId: accountId,
                categoryId: categoryId,
                payeeId: payeeId,
                payeeName: payeeName,
                amountCents: amountCents,
                date: date,
                notes: notes,
                cleared: cleared,
                origin: origin,
                originRef: originRef,
                createdAt: createdAt,
                updatedAt: updatedAt,
                deletedAt: deletedAt,
                syncStatus: syncStatus,
                syncError: syncError,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String?> actualId = const Value.absent(),
                required String accountId,
                Value<String?> categoryId = const Value.absent(),
                Value<String?> payeeId = const Value.absent(),
                Value<String?> payeeName = const Value.absent(),
                required int amountCents,
                required String date,
                Value<String?> notes = const Value.absent(),
                Value<bool> cleared = const Value.absent(),
                Value<String> origin = const Value.absent(),
                Value<String?> originRef = const Value.absent(),
                required int createdAt,
                required int updatedAt,
                Value<int?> deletedAt = const Value.absent(),
                Value<String> syncStatus = const Value.absent(),
                Value<String?> syncError = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => TransactionsCompanion.insert(
                id: id,
                actualId: actualId,
                accountId: accountId,
                categoryId: categoryId,
                payeeId: payeeId,
                payeeName: payeeName,
                amountCents: amountCents,
                date: date,
                notes: notes,
                cleared: cleared,
                origin: origin,
                originRef: originRef,
                createdAt: createdAt,
                updatedAt: updatedAt,
                deletedAt: deletedAt,
                syncStatus: syncStatus,
                syncError: syncError,
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
  $$SmsMessagesTableTableManager get smsMessages =>
      $$SmsMessagesTableTableManager(_db, _db.smsMessages);
  $$AppKvTableTableManager get appKv =>
      $$AppKvTableTableManager(_db, _db.appKv);
  $$AuditLogTableTableManager get auditLog =>
      $$AuditLogTableTableManager(_db, _db.auditLog);
}
