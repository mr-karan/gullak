import 'package:flutter/material.dart';

import '../motion.dart';

/// One category row's data. [fraction] is 0..1 of the largest row (bar width);
/// [amountText] and [percentText] are pre-formatted by the caller (money stays
/// out of the chart layer).
class CategoryBarDatum {
  const CategoryBarDatum({
    required this.label,
    required this.amountText,
    required this.color,
    required this.fraction,
    this.percentText,
    this.onTap,
  });

  final String label;
  final String amountText;
  final Color color;
  final double fraction;
  final String? percentText;
  final VoidCallback? onTap;
}

/// The category spend visual: a list of rows, each a swatch + name + amount +
/// optional % with a thin proportional bar beneath. Denser and more legible on
/// a phone than a donut, and every value is present as text (no chart-only
/// information). Bars grow on first build.
class CategoryBars extends StatelessWidget {
  const CategoryBars({required this.data, super.key});

  final List<CategoryBarDatum> data;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final duration = Motion.duration(context, Motion.slow);

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: duration,
      curve: Motion.enter,
      builder: (context, t, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final d in data)
            Semantics(
              label:
                  '${d.label}, ${d.amountText}'
                  '${d.percentText != null ? ', ${d.percentText}' : ''}',
              button: d.onTap != null,
              child: InkWell(
                onTap: d.onTap,
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: 8,
                    horizontal: 4,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              color: d.color,
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              d.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: text.bodyMedium,
                            ),
                          ),
                          if (d.percentText != null) ...[
                            Text(
                              d.percentText!,
                              style: text.labelSmall?.copyWith(
                                color: cs.onSurfaceVariant,
                              ),
                            ),
                            const SizedBox(width: 8),
                          ],
                          Text(d.amountText, style: text.bodyMedium),
                        ],
                      ),
                      const SizedBox(height: 6),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: Stack(
                          children: [
                            Container(
                              height: 4,
                              color: cs.surfaceContainerHighest,
                            ),
                            FractionallySizedBox(
                              widthFactor: (d.fraction * t).clamp(0.0, 1.0),
                              child: Container(height: 4, color: d.color),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
