# pocket

## Android APK

Install Node.js 22+ and Android Studio with an Android SDK (API 24 or newer). On the first setup:

```sh
npm install
npm run build
npx cap add android
```

Build a debug APK with:

```sh
npm run android:apk
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Open the native project in Android Studio with `npm run android:open`, or run it on a connected device/emulator with `npm run android:run`.

## Automatic Android releases

Every push to `main` builds a debug APK and publishes a GitHub release. The workflow increments the patch version from the highest `vMAJOR.MINOR.PATCH` tag; with no existing version tags, the first release is `v0.0.1` (from the `v0.0.0` baseline). The release tag and APK version name match; the Android version code increases with each workflow run.