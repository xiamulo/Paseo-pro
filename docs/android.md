# Android

## App variants

Controlled by `APP_VARIANT` in `packages/app/app.config.js` (vanilla Expo, no custom Gradle plugin):

| Variant       | App name    | Package ID        |
| ------------- | ----------- | ----------------- |
| `production`  | Paseo       | `paseo.pro`       |
| `development` | Paseo Debug | `paseo.pro.debug` |

EAS profiles: `development`, `production`, and `production-apk` in `packages/app/eas.json`.

`development` uses Android `debug`.

## Local build + install

From repo root:

```bash
npm run android:development    # Debug build
npm run android:production     # Release build
npm run android:clear          # Remove generated Android project
```

Or from `packages/app`:

```bash
# Debug
npx cross-env APP_VARIANT=development expo prebuild --platform android --non-interactive
npx cross-env APP_VARIANT=development expo run:android --variant=debug

# Release
npx cross-env APP_VARIANT=production expo prebuild --platform android --non-interactive
npx cross-env APP_VARIANT=production expo run:android --variant=release

# Clear generated Android project
rm -rf android
```

## Background agent streaming

Android uses a Notifee foreground service to keep the existing app WebSocket alive
while Paseo is backgrounded. The user-facing switch is in Settings -> General ->
Keep streaming in background and defaults on. When Android moves the app to the
background, Paseo starts a persistent "Streaming agents in background"
notification; when the app returns active, the foreground service is stopped.

The generated Android manifest is owned by Expo prebuild. Do not edit
`packages/app/android` by hand for this feature. The required foreground service
permission and `remoteMessaging` service type are declared in
`packages/app/app.config.js` so `npm run android:development` /
`npm run android:production` can regenerate the native project. Do not use the
`dataSync` foreground service type for this path; Android 15+ applies a 6-hour
background timeout to `dataSync`, which does not match always-on agent output.

Foreground services are still subject to Doze and vendor battery managers.
Pixel-style Android devices should keep streaming while the app is backgrounded,
but deep idle/device standby can suspend normal network access unless the user
exempts Paseo from battery optimization. Xiaomi, Huawei, OPPO, Vivo, and similar
ROMs may also require autostart or power-manager allowlisting.

## Screenshots

```bash
adb exec-out screencap -p > screenshot.png
```

## Cloud build + submit (EAS)

Stable tag pushes like `v0.1.0` trigger:

- `packages/app/.eas/workflows/release-mobile.yml` on Expo servers (iOS + Android build + submit)
- `.github/workflows/android-apk-release.yml` on GitHub Actions (local Gradle APK asset on GitHub Release; does not require `EXPO_TOKEN`)

Beta tags like `v0.1.1-beta.1` only trigger the GitHub APK workflow. They publish a GitHub prerelease APK for testing and do not submit to the stores.

`android-v*` tags also trigger only the GitHub APK workflow — useful when you want to ship an APK without going through stores. Both workflows also support `workflow_dispatch`; the GitHub APK one takes an existing `tag` input so you can rebuild without cutting a new tag.

The GitHub APK workflow restores npm, Gradle, Expo, and Metro caches, but it still
runs on a fresh GitHub-hosted runner for each tag. The first build after a cache
key changes may be close to a clean build; later builds mostly reuse downloaded
Gradle artifacts and eligible Gradle build-cache outputs. Release JS bundling and
native tasks whose inputs changed still run normally.

### Useful commands

```bash
cd packages/app

# List recent workflow runs
npx eas workflow:runs --workflow release-mobile.yml --limit 10

# Inspect a run
npx eas workflow:view <run-id>

# Stream logs for a failed job
npx eas workflow:logs <job-id> --non-interactive --all-steps
```
