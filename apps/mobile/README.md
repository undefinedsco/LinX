# LinX Mobile

Phase 1 mobile shell uses Capacitor to wrap the shared `apps/web` build output.

## Current Scope

- Shared web UI
- Solid Pod login only
- No dedicated mobile-native business logic yet

## Development

```bash
# Build the shared web shell for mobile
yarn workspace @linx/mobile build:web

# Sync Capacitor assets when android/ios projects exist
yarn workspace @linx/mobile sync

# Add native projects on demand
yarn workspace @linx/mobile add:android
yarn workspace @linx/mobile add:ios

# Build Android debug APK
yarn workspace @linx/mobile build:android:debug
```

If `apps/mobile/android` and `apps/mobile/ios` are absent, `sync` exits cleanly after building the shared web shell.

## Android Debug APK

- Requires `JAVA_HOME` compatible with Java 21 and `ANDROID_SDK_ROOT` pointing at an Android SDK with `platform-tools`, `platforms;android-34`, and `build-tools;34.0.0`
- On macOS with Homebrew, the helper script auto-detects `openjdk@21` and `android-commandlinetools` when installed in the default locations
- Output path: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

### Install on device

```bash
# Via adb
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

- If you are testing on HarmonyOS and do not use `adb`, copy `app-debug.apk` to the phone and install it manually
- HarmonyOS 4.x is the safer target for direct APK validation; HarmonyOS 5/6 may depend on the current Android compatibility layer on the device
