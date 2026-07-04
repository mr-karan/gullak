/// Canonical `YYYY-MM-DD` date string. Drift date columns are text and
/// compared lexicographically, so every producer of a stored/compared date
/// must format it identically — use this one helper, not a per-file copy.
String ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';
