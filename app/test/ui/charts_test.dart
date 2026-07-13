import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chavanni/ui/charts/bar_chart.dart';
import 'package:chavanni/ui/charts/category_bars.dart';
import 'package:chavanni/ui/charts/heatmap_calendar.dart';
import 'package:chavanni/ui/charts/progress_arc.dart';
import 'package:chavanni/ui/charts/sparkline.dart';

Widget _host(Widget child) => MaterialApp(
  home: Scaffold(
    body: Center(child: SizedBox(width: 320, child: child)),
  ),
);

void main() {
  testWidgets('Sparkline paints for empty, flat, and varied data', (t) async {
    for (final values in [
      <double>[],
      [5.0, 5.0, 5.0],
      [1.0, 8.0, 3.0, 9.0],
    ]) {
      await t.pumpWidget(
        _host(SizedBox(height: 40, child: Sparkline(values: values))),
      );
      await t.pumpAndSettle();
      expect(hasNoPaintException(), isTrue);
    }
  });

  testWidgets('BarChart renders and selection fires onSelect + tooltip', (
    t,
  ) async {
    int? selected;
    await t.pumpWidget(
      _host(
        BarChart(
          data: const [
            BarDatum(label: '1', spend: 10, income: 4),
            BarDatum(label: '2', spend: 20),
            BarDatum(label: '3', spend: 5, income: 30),
          ],
          tooltipFor: (i) => 'bar $i',
          onSelect: (i) => selected = i,
        ),
      ),
    );
    await t.pumpAndSettle();
    // Tap roughly the middle column.
    await t.tapAt(t.getCenter(find.byType(BarChart)));
    await t.pumpAndSettle();
    expect(selected, isNotNull);
  });

  testWidgets('CategoryBars shows labels, amounts and is tappable', (t) async {
    var tapped = false;
    await t.pumpWidget(
      _host(
        CategoryBars(
          data: [
            CategoryBarDatum(
              label: 'Groceries',
              amountText: '₹12,400',
              color: Colors.teal,
              fraction: 1,
              percentText: '34%',
              onTap: () => tapped = true,
            ),
            const CategoryBarDatum(
              label: 'Transport',
              amountText: '₹3,000',
              color: Colors.blue,
              fraction: 0.24,
            ),
          ],
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.text('Groceries'), findsOneWidget);
    expect(find.text('₹12,400'), findsOneWidget);
    expect(find.text('34%'), findsOneWidget);
    await t.tap(find.text('Groceries'));
    expect(tapped, isTrue);
  });

  testWidgets('ProgressArc renders under, at, and over 100%', (t) async {
    for (final p in [0.4, 1.0, 1.6]) {
      await t.pumpWidget(
        _host(ProgressArc(progress: p, child: Text('${(p * 100).round()}%'))),
      );
      await t.pumpAndSettle();
      expect(find.text('${(p * 100).round()}%'), findsOneWidget);
    }
  });

  testWidgets('HeatmapCalendar lays out a month and taps a day', (t) async {
    int? tappedDay;
    await t.pumpWidget(
      _host(
        HeatmapCalendar(
          year: 2026,
          month: 2, // 28 days, leap-free
          valueByDay: const {3: 500, 14: 1200, 28: 200},
          onTapDay: (d) => tappedDay = d,
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.text('14'), findsOneWidget);
    await t.tap(find.text('14'));
    expect(tappedDay, 14);
  });
}

/// Any thrown build/paint exception is captured by the test binding.
bool hasNoPaintException() =>
    TestWidgetsFlutterBinding.instance.takeException() == null;
