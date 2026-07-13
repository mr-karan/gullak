# Vendored geolocator_android (GMS-free patch)

- **Upstream:** geolocator_android 5.0.3 from pub.dev
  (https://pub.dev/packages/geolocator_android), MIT (see LICENSE).
  Copied verbatim minus `example/` and `test/`.
- **Why vendored:** upstream declares the proprietary
  `com.google.android.gms:play-services-location` and compiles a fused-
  provider client against it. An app-level Gradle exclude keeps GMS out of
  the APK, but F-Droid audits the *build graph*, not just the artifact —
  the proprietary dependency must not be declared or compiled at all
  (precedent: fdroiddata's org.digiagriapp recipe applies the same patch).
- **Modifications from upstream:**
  1. `android/build.gradle`: removed the
     `com.google.android.gms:play-services-location` dependency.
  2. Deleted `android/src/main/java/.../location/FusedLocationClient.java`.
  3. `GeolocationManager.java`: removed the GMS imports and the
     `isGooglePlayServicesAvailable` check; `createLocationClient` now
     always returns `LocationManagerClient` (platform LocationManager).
- **Behavior:** identical API; location fixes come from the platform
  LocationManager (slightly slower first fix than fused — irrelevant for
  tagging an expense with a neighbourhood).
- **Updating:** copy the new upstream release over this directory (keeping
  this file) and re-apply the three modifications above.
