import 'package:flutter/material.dart';

/// Shared error placeholder for `AsyncValue.when(error: …)` sites. Replaces the
/// bare `Center(child: Text('Error: $e'))` pattern with an editorial message,
/// the underlying detail (collapsed), and an optional Retry that the caller
/// wires to a provider invalidate.
class ErrorState extends StatelessWidget {
  const ErrorState({
    required this.message,
    this.title = 'Something went wrong',
    this.onRetry,
    this.compact = false,
    super.key,
  });

  /// Technical detail (usually `error.toString()`). Shown small and muted.
  final String message;
  final String title;
  final VoidCallback? onRetry;

  /// When true, renders inline (for cards/sections) instead of a full centered
  /// column — used where the error fills a small slot, not a whole screen.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final children = <Widget>[
      Icon(
        Icons.error_outline,
        size: compact ? 24 : 36,
        color: cs.onSurfaceVariant,
      ),
      SizedBox(height: compact ? 8 : 16),
      Text(title, style: text.titleMedium, textAlign: TextAlign.center),
      const SizedBox(height: 6),
      Text(
        message,
        style: text.bodySmall?.copyWith(color: cs.onSurfaceVariant),
        textAlign: TextAlign.center,
        maxLines: 3,
        overflow: TextOverflow.ellipsis,
      ),
      if (onRetry != null) ...[
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh, size: 18),
          label: const Text('Retry'),
        ),
      ],
    ];
    return Center(
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: 32,
          vertical: compact ? 20 : 48,
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: children),
      ),
    );
  }
}
