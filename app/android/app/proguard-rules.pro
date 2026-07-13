# F-Droid: play-services-location is excluded from the dependency graph
# (see build.gradle.kts). geolocator's Java code still *references* GMS
# classes on its fused-provider path, which we never execute (the Dart side
# forces the platform LocationManager). Tell R8 not to fail on those
# compile-time-only references.
-dontwarn com.google.android.gms.**
