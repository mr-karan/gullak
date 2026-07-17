import 'dart:io' show Platform;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geocoding/geocoding.dart' as geo;
import 'package:permission_handler/permission_handler.dart' as ph;
import 'package:geolocator/geolocator.dart';

class CapturedLocation {
  const CapturedLocation({
    required this.latitude,
    required this.longitude,
    this.name,
  });

  final double latitude;
  final double longitude;
  final String? name;
}

class LocationService {
  /// Non-interactive check — does NOT prompt. Permission is requested up
  /// front from the settings toggle ([ensurePermission]); capture time should
  /// never pop a dialog mid-save.
  Future<bool> canCapture() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    final permission = await Geolocator.checkPermission();
    return permission == LocationPermission.always ||
        permission == LocationPermission.whileInUse;
  }

  /// Best-effort location capture. **Never throws** — returns null on any
  /// failure (permission off, service off, GPS timeout, platform error) so a
  /// caller can fire it without risking whatever it's attached to (e.g. a
  /// transaction save). Prefers a recent last-known fix (instant), else a
  /// live medium-accuracy fix capped at 8s.
  Future<CapturedLocation?> capture() async {
    try {
      if (!await canCapture()) return null;
      var pos = await Geolocator.getLastKnownPosition(
        forceAndroidLocationManager: true,
      );
      final fresh =
          pos != null && DateTime.now().difference(pos.timestamp).inMinutes < 2;
      if (!fresh) {
        // On Android we force the platform LocationManager instead of the
        // Play-Services fused provider: the GMS artifact is excluded at the
        // Gradle level (F-Droid forbids non-free deps), so the fused path
        // must never be taken. Accuracy is slightly worse; for tagging an
        // expense with a neighbourhood, it doesn't matter.
        pos = await Geolocator.getCurrentPosition(
          locationSettings: Platform.isAndroid
              ? AndroidSettings(
                  forceLocationManager: true,
                  accuracy: LocationAccuracy.medium,
                  timeLimit: const Duration(seconds: 8),
                )
              : const LocationSettings(
                  accuracy: LocationAccuracy.medium,
                  timeLimit: Duration(seconds: 8),
                ),
        );
      }
      return CapturedLocation(
        latitude: pos.latitude,
        longitude: pos.longitude,
        name: await _placeName(pos.latitude, pos.longitude),
      );
    } catch (_) {
      // Timeout / permission race / platform error — never break the caller.
      return null;
    }
  }

  /// Reverse-geocode to a compact "place, area" label. Best-effort; null on
  /// any failure so a missing name never blocks the coordinates.
  Future<String?> _placeName(double lat, double lng) async {
    try {
      final marks = await geo.placemarkFromCoordinates(lat, lng);
      if (marks.isEmpty) return null;
      final p = marks.first;
      final seen = <String>{};
      final label = [p.name, p.subLocality, p.locality]
          .map((s) => (s ?? '').trim())
          .where((s) => s.isNotEmpty && seen.add(s.toLowerCase()))
          .take(2)
          .join(', ');
      return label.isEmpty ? null : label;
    } catch (_) {
      return null;
    }
  }

  /// Called from the settings toggle so the OS permission prompt happens when
  /// the user opts in — not silently deferred to the first save. Returns the
  /// resulting permission so the UI can warn on denial.
  Future<LocationPermission> ensurePermission() async {
    // Request via permission_handler, NOT Geolocator.requestPermission().
    // Both plugins register an onRequestPermissionsResult listener; geolocator's
    // request then double-replies to the platform channel → a native
    // "Reply already submitted" crash. The app already routes SMS permission
    // through permission_handler, so keep all requests on that one path.
    // Geolocator is still used for the location *fetch* (no permission request).
    final current = await Geolocator.checkPermission();
    if (current == LocationPermission.always ||
        current == LocationPermission.whileInUse) {
      return current;
    }
    final status = await ph.Permission.locationWhenInUse.request();
    if (status.isGranted || status.isLimited) {
      return LocationPermission.whileInUse;
    }
    if (status.isPermanentlyDenied) return LocationPermission.deniedForever;
    return LocationPermission.denied;
  }

  Future<bool> openSystemSettings() => ph.openAppSettings();
}

final locationServiceProvider = Provider<LocationService>(
  (_) => LocationService(),
);
