# Enigma Mobile (Capacitor) - Production Setup

This project now includes a production-ready Capacitor shell on top of the existing Next.js app.

## Architecture

- Web app remains the source of truth (`Next.js`, existing auth/realtime logic unchanged).
- Native Android/iOS projects are generated in:
  - `web/android`
  - `web/ios`
- Native apps load production web via `server.url` from `web/capacitor.config.ts`.

## Current Native Capabilities Prepared

- App lifecycle listeners (`@capacitor/app`)
- Deep link handling (`enigma://` and web URL handling in bridge)
- Native push bootstrap (`@capacitor/push-notifications`)
- Badge counters (`@capawesome/capacitor-badge`)
- Splash and status bar configuration (`@capacitor/splash-screen`, `@capacitor/status-bar`)

Bootstrap logic lives in `web/src/components/PushNotificationsBootstrap.tsx` and runs only on native platform.

## Commands

From repository root:

- Sync native projects:
  - `npm run mobile:sync`
- Regenerate icons/splash:
  - `npm run mobile:assets`
- Open Android Studio project:
  - `npm run mobile:android`
- Open Xcode project:
  - `npm run mobile:ios`

From `web/` directly:

- `npm run cap:sync`
- `npm run cap:assets`
- `npm run cap:open:android`
- `npm run cap:open:ios`
- `npm run cap:android:run`
- `npm run cap:ios:run`

## Android-First Launch Checklist

1. Build/deploy web app as usual (production URL must be reachable by device).
2. Run `npm run mobile:assets` (if icon/splash changed).
3. Run `npm run mobile:sync`.
4. Open Android Studio via `npm run mobile:android`.
5. Configure Firebase (`google-services.json`) for push notifications.
6. Build and run on device.
7. Verify:
   - auth session persistence
   - realtime chat updates
   - push tap deep links to expected route
   - badge updates and clear behavior

## iPhone / TestFlight Next

1. Ensure Apple signing team/profile is configured in Xcode.
2. Configure APNs and Firebase iOS push (`GoogleService-Info.plist`).
3. Run `npm run mobile:ios`.
4. Archive and upload to TestFlight.

## Notes

- PWA/web flow is untouched and remains fully operational.
- Capacitor shell is configured for long-term native evolution (push, badges, deep links, lifecycle).
