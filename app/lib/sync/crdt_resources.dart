import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart';

import '../data/db/database.dart';
import 'crdt.dart';

const int crdtMaxSafeInteger = 9007199254740991;

enum CrdtRegisterPolicy {
  multiValue('mvr'),
  removeWins('remove_wins'),
  addWins('add_wins');

  const CrdtRegisterPolicy(this.storageName);

  final String storageName;
}

enum _ValueKind {
  string,
  nullableString,
  integer,
  nullableInteger,
  number,
  nullableNumber,
  boolean,
}

final class CrdtProjectionException implements Exception {
  const CrdtProjectionException(this.message);

  final String message;

  @override
  String toString() => 'CrdtProjectionException: $message';
}

final class _CrdtResourceDefinition {
  const _CrdtResourceDefinition({
    required this.table,
    required this.lifecycleField,
    required this.requiredFields,
    required this.fields,
  });

  final String table;
  final String lifecycleField;
  final Set<String> requiredFields;
  final Map<String, _ValueKind> fields;
}

const Set<String> syncedCrdtResources = {
  'accounts',
  'category_groups',
  'categories',
  'payees',
  'transactions',
  'tags',
  'transaction_tags',
  'budgets',
  'recurrences',
};

/// Fields that are part of the replicated contract for [resource]. Database
/// primary keys and locally-derived cache columns are deliberately absent.
Set<String> crdtPayloadFields(String resource) =>
    Set.unmodifiable(_crdtResource(resource).fields.keys);

String crdtLifecycleField(String resource) =>
    _crdtResource(resource).lifecycleField;

/// Add-wins relation identity. Equivalent links authored independently must
/// address the same entity or they cannot converge as a set.
String transactionTagEntityId(String transactionId, String tagId) =>
    'tt:${jsonEncode([transactionId, tagId])}';

const Map<String, _CrdtResourceDefinition> _definitions = {
  'accounts': _CrdtResourceDefinition(
    table: 'accounts',
    lifecycleField: r'$exists',
    requiredFields: {
      'name',
      'kind',
      'openingBalanceCents',
      'onBudget',
      'archived',
      'sortOrder',
      'createdAt',
      'updatedAt',
    },
    fields: {
      'name': _ValueKind.string,
      'kind': _ValueKind.string,
      'openingBalanceCents': _ValueKind.integer,
      'reconciledBalanceCents': _ValueKind.nullableInteger,
      'reconciledAt': _ValueKind.nullableInteger,
      'onBudget': _ValueKind.boolean,
      'archived': _ValueKind.boolean,
      'sortOrder': _ValueKind.integer,
      'createdAt': _ValueKind.integer,
      'updatedAt': _ValueKind.integer,
    },
  ),
  'category_groups': _CrdtResourceDefinition(
    table: 'category_groups',
    lifecycleField: r'$exists',
    requiredFields: {'name', 'isIncome', 'sortOrder'},
    fields: {
      'name': _ValueKind.string,
      'isIncome': _ValueKind.boolean,
      'sortOrder': _ValueKind.integer,
    },
  ),
  'categories': _CrdtResourceDefinition(
    table: 'categories',
    lifecycleField: r'$exists',
    requiredFields: {'name', 'groupId', 'hidden', 'sortOrder', 'updatedAt'},
    fields: {
      'name': _ValueKind.string,
      'groupId': _ValueKind.string,
      'parentId': _ValueKind.nullableString,
      'color': _ValueKind.nullableInteger,
      'icon': _ValueKind.nullableString,
      'hidden': _ValueKind.boolean,
      'sortOrder': _ValueKind.integer,
      'updatedAt': _ValueKind.integer,
    },
  ),
  'payees': _CrdtResourceDefinition(
    table: 'payees',
    lifecycleField: r'$exists',
    requiredFields: {'name', 'learnCategories', 'updatedAt'},
    fields: {
      'name': _ValueKind.string,
      // useCount is derived and deliberately absent.
      'learnCategories': _ValueKind.boolean,
      'updatedAt': _ValueKind.integer,
    },
  ),
  'transactions': _CrdtResourceDefinition(
    table: 'transactions',
    lifecycleField: r'$exists',
    requiredFields: {
      'accountId',
      'amountCents',
      'date',
      'cleared',
      'reconciled',
      'origin',
      'isGroupParent',
      'createdAt',
      'updatedAt',
    },
    fields: {
      'accountId': _ValueKind.string,
      'categoryId': _ValueKind.nullableString,
      'payeeId': _ValueKind.nullableString,
      'payeeName': _ValueKind.nullableString,
      'amountCents': _ValueKind.integer,
      'date': _ValueKind.string,
      'notes': _ValueKind.nullableString,
      'latitude': _ValueKind.nullableNumber,
      'longitude': _ValueKind.nullableNumber,
      'locationName': _ValueKind.nullableString,
      'cleared': _ValueKind.boolean,
      'reconciled': _ValueKind.boolean,
      'origin': _ValueKind.string,
      'originRef': _ValueKind.nullableString,
      'importedId': _ValueKind.nullableString,
      'transferAccountId': _ValueKind.nullableString,
      'transferGroupId': _ValueKind.nullableString,
      'parentId': _ValueKind.nullableString,
      // splitTotalCents is a projection cache derived from split children.
      'groupParentId': _ValueKind.nullableString,
      'isGroupParent': _ValueKind.boolean,
      'originalAmountCents': _ValueKind.nullableInteger,
      'originalCurrency': _ValueKind.nullableString,
      'createdAt': _ValueKind.integer,
      'updatedAt': _ValueKind.integer,
    },
  ),
  'tags': _CrdtResourceDefinition(
    table: 'tags',
    lifecycleField: r'$exists',
    requiredFields: {'name', 'archived', 'createdAt', 'updatedAt'},
    fields: {
      'name': _ValueKind.string,
      'color': _ValueKind.nullableInteger,
      'archived': _ValueKind.boolean,
      'createdAt': _ValueKind.integer,
      'updatedAt': _ValueKind.integer,
    },
  ),
  'transaction_tags': _CrdtResourceDefinition(
    table: 'transaction_tags',
    lifecycleField: r'$member',
    requiredFields: {'transactionId', 'tagId', 'updatedAt'},
    fields: {
      'transactionId': _ValueKind.string,
      'tagId': _ValueKind.string,
      'updatedAt': _ValueKind.integer,
    },
  ),
  'budgets': _CrdtResourceDefinition(
    table: 'budgets',
    lifecycleField: r'$exists',
    requiredFields: {
      'categoryId',
      'month',
      'targetCents',
      'rolloverCents',
      'updatedAt',
    },
    fields: {
      'categoryId': _ValueKind.string,
      'month': _ValueKind.string,
      'targetCents': _ValueKind.integer,
      'rolloverCents': _ValueKind.integer,
      'updatedAt': _ValueKind.integer,
    },
  ),
  'recurrences': _CrdtResourceDefinition(
    table: 'recurrences',
    lifecycleField: r'$exists',
    requiredFields: {
      'accountId',
      'amountCents',
      'cadence',
      'nextDate',
      'createdAt',
      'updatedAt',
    },
    fields: {
      'accountId': _ValueKind.string,
      'categoryId': _ValueKind.nullableString,
      'payeeId': _ValueKind.nullableString,
      'payeeName': _ValueKind.nullableString,
      'amountCents': _ValueKind.integer,
      'notes': _ValueKind.nullableString,
      'cadence': _ValueKind.string,
      'nextDate': _ValueKind.string,
      'anchorDay': _ValueKind.nullableInteger,
      'createdAt': _ValueKind.integer,
      'updatedAt': _ValueKind.integer,
    },
  ),
};

_CrdtResourceDefinition _crdtResource(String resource) {
  final definition = _definitions[resource];
  if (definition == null) {
    throw CrdtProjectionException('unsupported synced resource $resource');
  }
  return definition;
}

CrdtRegisterPolicy crdtRegisterPolicy(String resource, String field) {
  final definition = _crdtResource(resource);
  if (field == definition.lifecycleField) {
    return field == r'$member'
        ? CrdtRegisterPolicy.addWins
        : CrdtRegisterPolicy.removeWins;
  }
  if (field.startsWith(r'$')) {
    throw CrdtProjectionException(
      'unsupported reserved field $resource.$field',
    );
  }
  return CrdtRegisterPolicy.multiValue;
}

void validateCrdtFieldValue(String resource, String field, Object? value) {
  final definition = _crdtResource(resource);
  final policy = crdtRegisterPolicy(resource, field);
  if (policy != CrdtRegisterPolicy.multiValue) {
    if (value is! bool) {
      throw CrdtProjectionException('$resource.$field must be boolean');
    }
    return;
  }

  final kind = definition.fields[field];
  if (kind == null) return; // Unknown future field: retain opaquely.
  final nullable = switch (kind) {
    _ValueKind.nullableString ||
    _ValueKind.nullableInteger ||
    _ValueKind.nullableNumber => true,
    _ => false,
  };
  if (value == null) {
    if (nullable) return;
    throw CrdtProjectionException('$resource.$field cannot be null');
  }

  final valid = switch (kind) {
    _ValueKind.string || _ValueKind.nullableString => value is String,
    _ValueKind.boolean => value is bool,
    _ValueKind.integer || _ValueKind.nullableInteger =>
      value is num &&
          value.isFinite &&
          value == value.truncateToDouble() &&
          value >= -crdtMaxSafeInteger &&
          value <= crdtMaxSafeInteger,
    _ValueKind.number ||
    _ValueKind.nullableNumber => value is num && value.isFinite,
  };
  if (!valid) {
    throw CrdtProjectionException(
      '$resource.$field has an invalid ${kind.name} value',
    );
  }
}

/// Rebuilds each touched relational row from visible register projections.
Future<void> materializeCrdtTargets(
  AppDatabase db, {
  required String epoch,
  required Iterable<({String resource, String entityId})> targets,
}) async {
  final unique = <String, ({String resource, String entityId})>{};
  for (final target in targets) {
    _crdtResource(target.resource);
    unique['${target.resource}\u0000${target.entityId}'] = target;
  }
  for (final target in unique.values) {
    await materializeCrdtEntity(
      db,
      epoch: epoch,
      resource: target.resource,
      entityId: target.entityId,
    );
  }
  await _refreshDerivedProjections(db, unique.values);
  final changedResources = unique.values
      .map((target) => target.resource)
      .toSet();
  final changedTables = <TableInfo>{
    ...changedResources.map((resource) => _driftTable(db, resource)),
    if (changedResources.contains('transactions') ||
        changedResources.contains('payees'))
      db.payees,
    if (changedResources.contains('transactions') ||
        changedResources.contains('payees'))
      db.transactions,
    if (changedResources.contains('recurrences') ||
        changedResources.contains('payees'))
      db.recurrences,
  };
  db.markTablesUpdated(changedTables);
}

Future<void> materializeCrdtEntity(
  AppDatabase db, {
  required String epoch,
  required String resource,
  required String entityId,
}) async {
  final definition = _crdtResource(resource);
  final registers =
      await (db.select(db.syncRegisters)..where(
            (row) =>
                row.epoch.equals(epoch) &
                row.resource.equals(resource) &
                row.entityId.equals(entityId),
          ))
          .get();
  final lifecycle = registers
      .where((row) => row.field == definition.lifecycleField)
      .firstOrNull;
  if (lifecycle?.visibleValueJson == null) return;
  final exists = _decodeVisible(lifecycle!.visibleValueJson!);
  if (exists is! bool) {
    throw CrdtProjectionException(
      '$resource/$entityId ${definition.lifecycleField} must be boolean',
    );
  }
  if (!exists) {
    await db.customStatement('DELETE FROM ${definition.table} WHERE id = ?', [
      entityId,
    ]);
    return;
  }

  final projected = <String, Object?>{};
  for (final register in registers) {
    if (!definition.fields.containsKey(register.field) ||
        register.visibleValueJson == null) {
      continue;
    }
    final value = _decodeVisible(register.visibleValueJson!);
    validateCrdtFieldValue(resource, register.field, value);
    projected[register.field] =
        resource == 'transactions' &&
            (register.field == 'latitude' || register.field == 'longitude') &&
            value != null
        ? _quantizeCoordinate((value as num).toDouble())
        : value;
  }

  if (resource == 'transaction_tags' &&
      projected['transactionId'] is String &&
      projected['tagId'] is String) {
    final expected = transactionTagEntityId(
      projected['transactionId']! as String,
      projected['tagId']! as String,
    );
    if (entityId != expected) {
      throw CrdtProjectionException(
        'transaction_tags identity must be $expected, got $entityId',
      );
    }
  }
  if (resource == 'transactions' &&
      (projected['origin'] == 'split' || projected['isGroupParent'] == true)) {
    // Parent amounts are relational projections, not authored facts.
    projected['amountCents'] = 0;
  }

  final current = await db
      .customSelect(
        'SELECT id FROM ${definition.table} WHERE id = ? LIMIT 1',
        variables: [Variable<String>(entityId)],
      )
      .getSingleOrNull();
  if (current == null) {
    final missing = definition.requiredFields.difference(
      projected.keys.toSet(),
    );
    if (missing.isNotEmpty) {
      final sorted = missing.toList()..sort();
      throw CrdtProjectionException(
        '$resource/$entityId create is missing ${sorted.join(', ')}',
      );
    }
    final entries = <MapEntry<String, Object?>>[
      MapEntry('id', entityId),
      ...projected.entries.map(
        (entry) => MapEntry(_sqlColumn(entry.key), entry.value),
      ),
    ];
    await db.customStatement(
      'INSERT INTO ${definition.table} '
      '(${entries.map((entry) => entry.key).join(', ')}) '
      'VALUES (${List.filled(entries.length, '?').join(', ')})',
      entries.map((entry) => _sqliteValue(entry.value)).toList(),
    );
    return;
  }

  if (projected.isEmpty) return;
  final entries = projected.entries
      .map((entry) => MapEntry(_sqlColumn(entry.key), entry.value))
      .toList();
  await db.customStatement(
    'UPDATE ${definition.table} SET '
    '${entries.map((entry) => '${entry.key} = ?').join(', ')} WHERE id = ?',
    [...entries.map((entry) => _sqliteValue(entry.value)), entityId],
  );
}

Future<void> _refreshDerivedProjections(
  AppDatabase db,
  Iterable<({String resource, String entityId})> targets,
) async {
  final resources = targets.map((target) => target.resource).toSet();
  if (resources.contains('transactions')) {
    await db.customStatement(
      'UPDATE transactions SET amount_cents = COALESCE(('
      'SELECT SUM(child.amount_cents) FROM transactions child '
      'WHERE child.parent_id = transactions.id), 0), '
      'split_total_cents = COALESCE(('
      'SELECT SUM(child.amount_cents) FROM transactions child '
      'WHERE child.parent_id = transactions.id), 0) '
      "WHERE origin = 'split'",
    );
    await db.customStatement(
      'UPDATE transactions SET amount_cents = 0 WHERE is_group_parent = 1',
    );
  }

  if (resources.contains('payees') || resources.contains('transactions')) {
    await db.customStatement(
      'UPDATE payees SET use_count = ('
      'SELECT COUNT(*) FROM transactions '
      'WHERE transactions.payee_id = payees.id '
      'AND transactions.parent_id IS NULL '
      'AND transactions.is_group_parent = 0)',
    );
    await db.customStatement(
      'UPDATE transactions SET payee_name = ('
      'SELECT payees.name FROM payees WHERE payees.id = transactions.payee_id) '
      'WHERE payee_id IS NOT NULL AND EXISTS ('
      'SELECT 1 FROM payees WHERE payees.id = transactions.payee_id)',
    );
  }
  if (resources.contains('payees') || resources.contains('recurrences')) {
    await db.customStatement(
      'UPDATE recurrences SET payee_name = ('
      'SELECT payees.name FROM payees WHERE payees.id = recurrences.payee_id) '
      'WHERE payee_id IS NOT NULL AND EXISTS ('
      'SELECT 1 FROM payees WHERE payees.id = recurrences.payee_id)',
    );
  }
}

/// Hashes the complete materialized v2 projection using the same canonical
/// resource/entity/field representation as the server genesis fold. A
/// checkpoint is not trusted until this independently computed digest matches:
/// matching event/register bytes alone would not detect a divergent Dart
/// materializer.
Future<String> crdtProjectionHash(AppDatabase db) async {
  final payeeRows = await db.customSelect('SELECT id, name FROM payees').get();
  final payeeNames = <String, Object?>{
    for (final row in payeeRows)
      row.read<String>('id'): row.read<String>('name'),
  };
  final resources = <Map<String, Object?>>[];
  final resourceNames = _definitions.keys.toList()..sort();

  for (final resource in resourceNames) {
    final definition = _definitions[resource]!;
    final rows = await db
        .customSelect('SELECT * FROM ${definition.table}')
        .get();
    final entities = <Map<String, Object?>>[];
    for (final row in rows) {
      final data = row.data;
      final physicalId = data['id'];
      if (physicalId is! String || physicalId.isEmpty) {
        throw CrdtProjectionException('$resource contains an invalid id');
      }
      final transactionId = data['transaction_id'];
      final tagId = data['tag_id'];
      final entityId = resource == 'transaction_tags'
          ? transactionId is String && tagId is String
                ? transactionTagEntityId(transactionId, tagId)
                : throw const CrdtProjectionException(
                    'transaction_tags contains an invalid logical identity',
                  )
          : physicalId;
      final fields = <String, Object?>{};
      for (final entry in definition.fields.entries) {
        final field = entry.key;
        final column = _sqlColumn(field);
        if (!data.containsKey(column)) {
          throw CrdtProjectionException(
            '$resource/$entityId is missing $field',
          );
        }
        Object? value = data[column];
        if (entry.value == _ValueKind.boolean) {
          if (value is int) value = value != 0;
          if (value is! bool) {
            throw CrdtProjectionException(
              '$resource/$entityId has invalid boolean $field',
            );
          }
        }
        if (field == 'payeeName' && data['payee_id'] is String) {
          value = payeeNames[data['payee_id']] ?? value;
        }
        validateCrdtFieldValue(resource, field, value);
        fields[field] = value;
      }
      entities.add({'id': entityId, 'fields': fields});
    }
    entities.sort(
      (left, right) =>
          (left['id']! as String).compareTo(right['id']! as String),
    );
    resources.add({
      'resource': resource,
      'lifecycle': definition.lifecycleField,
      'entities': entities,
    });
  }

  return sha256.convert(utf8.encode(encodeCanonicalJson(resources))).toString();
}

double _quantizeCoordinate(double value) {
  final quantized = (value * 10000000).round() / 10000000;
  return quantized == 0 ? 0 : quantized;
}

TableInfo _driftTable(AppDatabase db, String resource) => switch (resource) {
  'accounts' => db.accounts,
  'category_groups' => db.categoryGroups,
  'categories' => db.categories,
  'payees' => db.payees,
  'transactions' => db.transactions,
  'tags' => db.tags,
  'transaction_tags' => db.transactionTags,
  'budgets' => db.budgets,
  'recurrences' => db.recurrences,
  _ => throw CrdtProjectionException('unsupported synced resource $resource'),
};

Object? _decodeVisible(String value) {
  try {
    return jsonDecode(value);
  } on FormatException catch (error) {
    throw CrdtProjectionException('invalid visible JSON: $error');
  }
}

Object? _sqliteValue(Object? value) => value is bool ? (value ? 1 : 0) : value;

String _sqlColumn(String field) => field.replaceAllMapped(
  RegExp('[A-Z]'),
  (match) => '_${match.group(0)!.toLowerCase()}',
);
