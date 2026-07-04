import 'package:flutter/material.dart';

/// App-standard modal bottom sheet. Always shown on the **root** navigator so
/// it covers the shell's bottom navigation bar and floating action button —
/// otherwise those stay live under the open sheet and a stray tap can swap the
/// screen out from under a half-filled form.
///
/// Prefer this over calling `showModalBottomSheet` directly.
Future<T?> showAppSheet<T>(
  BuildContext context, {
  required WidgetBuilder builder,
  bool isScrollControlled = true,
  bool showDragHandle = true,
  bool useSafeArea = true,
}) {
  return showModalBottomSheet<T>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: isScrollControlled,
    showDragHandle: showDragHandle,
    useSafeArea: useSafeArea,
    builder: builder,
  );
}
