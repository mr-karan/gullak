part of 'quick_entry_sheet.dart';

class _QuickEntrySkeleton extends StatelessWidget {
  const _QuickEntrySkeleton();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    Widget bar({required double width, required double height}) => Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: 96,
            decoration: BoxDecoration(
              color: cs.surfaceContainer,
              borderRadius: BorderRadius.circular(20),
            ),
            padding: const EdgeInsets.all(20),
            child: Align(
              alignment: Alignment.centerLeft,
              child: bar(width: 160, height: 36),
            ),
          ),
          const SizedBox(height: 20),
          for (final width in [220.0, 180.0, 200.0, 140.0]) ...[
            Row(
              children: [
                bar(width: 22, height: 22),
                const SizedBox(width: 16),
                bar(width: width, height: 20),
              ],
            ),
            const SizedBox(height: 24),
          ],
        ],
      ),
    );
  }
}
