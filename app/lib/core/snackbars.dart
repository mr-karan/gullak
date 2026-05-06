import 'dart:async';

import 'package:flutter/material.dart';

SnackBar errorSnackBar(BuildContext context, String message) {
  final cs = Theme.of(context).colorScheme;
  return SnackBar(
    backgroundColor: cs.errorContainer,
    content: Text(
      message,
      style: TextStyle(color: cs.onErrorContainer, fontWeight: FontWeight.w600),
    ),
  );
}

/// Shows a snackbar and force-closes it after [duration].
///
/// Two failure modes this guards against:
/// 1. Calling [ScaffoldMessengerState.showSnackBar] while another snackbar
///    is showing queues the new one; previously we used
///    `hideCurrentSnackBar()` which only dismisses the visible toast and
///    lets stale queued toasts surface seconds later, looking sticky.
///    `clearSnackBars()` drops the visible one AND the queue so a fresh
///    call to this helper genuinely supersedes whatever came before.
/// 2. Android accessibility settings can make SnackBars with actions stay
///    on screen much longer than their declared duration. Action snackbars
///    get an explicit Timer to force-close the controller. Plain
///    info/error snackbars (no [SnackBar.action]) rely on the messenger's
///    own auto-dismiss — so we don't leave a pending Timer behind in
///    widget tests, which assert on test teardown.
ScaffoldFeatureController<SnackBar, SnackBarClosedReason> showTimedSnackBar(
  ScaffoldMessengerState messenger,
  SnackBar snackBar, {
  Duration duration = const Duration(seconds: 3),
}) {
  messenger.clearSnackBars();
  final controller = messenger.showSnackBar(
    SnackBar(
      content: snackBar.content,
      backgroundColor: snackBar.backgroundColor,
      elevation: snackBar.elevation,
      margin: snackBar.margin,
      padding: snackBar.padding,
      width: snackBar.width,
      shape: snackBar.shape,
      behavior: snackBar.behavior,
      action: snackBar.action,
      showCloseIcon: snackBar.showCloseIcon,
      closeIconColor: snackBar.closeIconColor,
      duration: duration,
      dismissDirection: snackBar.dismissDirection,
      clipBehavior: snackBar.clipBehavior,
    ),
  );
  if (snackBar.action != null) {
    final timer = Timer(duration + const Duration(milliseconds: 150), () {
      controller.close();
    });
    controller.closed.whenComplete(timer.cancel);
  }
  return controller;
}
