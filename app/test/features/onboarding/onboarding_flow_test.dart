import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/core/prefs.dart';
import 'package:gullak/core/secure_store.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/features/onboarding/onboarding_flow.dart';
import 'package:gullak/state/providers.dart';
import 'package:gullak/sync/remote_applier.dart';
import 'package:gullak/sync/sync_service.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _UnauthorizedDio implements Dio {
  @override
  Future<Response<T>> get<T>(
    String path, {
    Object? data,
    Options? options,
    Map<String, dynamic>? queryParameters,
    CancelToken? cancelToken,
    ProgressCallback? onReceiveProgress,
  }) async {
    final request = RequestOptions(path: path);
    throw DioException(
      requestOptions: request,
      response: Response<Object?>(requestOptions: request, statusCode: 401),
      type: DioExceptionType.badResponse,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

/// Smoke harness for the onboarding flow.
///
/// Catches a class of bug we've been hitting at the device level —
/// e.g. `FilledButtonThemeData.minimumSize = Size.fromHeight(52)`
/// produced an Infinity min-width that worked inside a Column but
/// blew up inside a Row, leaving the Done button missing on the
/// final page. This test pumps the real OnboardingFlow with Drift
/// in memory, drives through all three pages, and asserts both
/// action buttons on the final page render at non-zero size with
/// no FlutterError emissions.
///
/// If any layout exception fires during the pump (RenderFlex
/// overflow, Infinity constraint, missing size), [FlutterError.onError]
/// captures it and the test fails with the captured details.
void main() {
  Future<({AppDatabase db, ProviderContainer container})> bootstrap(
    WidgetTester tester, {
    Size surfaceSize = const Size(390, 800),
    double textScale = 1.0,
    Dio? syncDio,
  }) async {
    SharedPreferences.setMockInitialValues(const <String, Object>{});
    FlutterSecureStorage.setMockInitialValues({});
    final prefs = await Prefs.load();
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    final secure = SecureStore();
    final sync = SyncService(
      db,
      secure,
      prefs,
      RemoteApplier(db),
      dio: syncDio,
    );
    addTearDown(db.close);

    await tester.binding.setSurfaceSize(surfaceSize);
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          dbProvider.overrideWithValue(db),
          prefsProvider.overrideWithValue(prefs),
          secureStoreProvider.overrideWithValue(secure),
          syncServiceProvider.overrideWithValue(sync),
        ],
        child: MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(
              size: surfaceSize,
              textScaler: TextScaler.linear(textScale),
            ),
            child: const OnboardingFlow(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return (
      db: db,
      container: ProviderScope.containerOf(
        tester.element(find.byType(OnboardingFlow)),
      ),
    );
  }

  testWidgets('all three pages render with no layout exceptions', (
    tester,
  ) async {
    final layoutErrors = <FlutterErrorDetails>[];
    final original = FlutterError.onError;
    FlutterError.onError = layoutErrors.add;
    addTearDown(() => FlutterError.onError = original);

    await bootstrap(tester);

    // Page 1: welcome + currency
    expect(find.text('Gullak'), findsOneWidget);
    expect(find.text('Continue'), findsOneWidget);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    // Page 2: first account
    expect(find.text('First account'), findsOneWidget);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    // Page 3: Sync server — both action buttons must be visible AND
    // non-zero size, which is what the previous theme bug tripped.
    expect(find.text('Sync server'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);
    expect(find.text('Done'), findsOneWidget);
    expect(tester.getRect(find.text('Skip')).width, greaterThan(0));
    expect(tester.getRect(find.text('Done')).width, greaterThan(0));

    expect(
      layoutErrors,
      isEmpty,
      reason: layoutErrors.map((e) => e.exceptionAsString()).join('\n---\n'),
    );
  });

  testWidgets('Sync server page survives larger text scale + small viewport', (
    tester,
  ) async {
    final layoutErrors = <FlutterErrorDetails>[];
    final original = FlutterError.onError;
    FlutterError.onError = layoutErrors.add;
    addTearDown(() => FlutterError.onError = original);

    // Smaller viewport + larger text — the keyboard-up / large-text
    // case that the scrollable shell is supposed to absorb.
    await bootstrap(tester, surfaceSize: const Size(360, 640), textScale: 1.3);

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    // The page is allowed to require scrolling; the test only insists
    // there's no layout exception and both buttons exist somewhere.
    expect(find.text('Sync server'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);
    expect(find.text('Done'), findsOneWidget);
    expect(
      layoutErrors,
      isEmpty,
      reason: layoutErrors.map((e) => e.exceptionAsString()).join('\n---\n'),
    );
  });

  testWidgets('welcome page offers a restore path with URL + key fields', (
    tester,
  ) async {
    await bootstrap(tester);

    final restore = find.text('Already have a sync server? Restore');
    expect(restore, findsOneWidget);

    await tester.tap(restore);
    await tester.pumpAndSettle();

    // The restore dialog collects a server URL and an API key, and explicitly
    // does not create a new account.
    expect(find.text('Restore from server'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Server URL'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'API key'), findsOneWidget);
    expect(find.text('Connect & restore'), findsOneWidget);
  });

  testWidgets('restore refuses unauthenticated credentials before onboarding', (
    tester,
  ) async {
    final harness = await bootstrap(tester, syncDio: _UnauthorizedDio());
    await tester.tap(find.text('Already have a sync server? Restore'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextField, 'Server URL'),
      'https://server.test',
    );
    await tester.enterText(find.widgetWithText(TextField, 'API key'), 'wrong');
    await tester.tap(find.text('Connect & restore'));
    await tester.pumpAndSettle();

    expect(await harness.db.kvGet('onboarded'), isNull);
    expect(find.textContaining('Restore failed:'), findsOneWidget);
    expect(find.text('Gullak'), findsOneWidget);
  });
}
