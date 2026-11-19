# do-not-disturb (Expo local module, Android only)

Turns Android's "No molestar" on while the individual stopwatch records a video, and puts the phone's previous mode back afterwards (issue #1090). The option is off by default, in Ajustes, "Grabación de video".

- `hasAccess()`: whether the person granted the app access to "No molestar" (`NotificationManager.isNotificationPolicyAccessGranted`). It is granted once, in Android's settings.
- `openAccessSettings()`: opens that screen of Android's settings (`Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS`).
- `turnOn()`: saves the current mode and switches to "Solo prioridad" (`INTERRUPTION_FILTER_PRIORITY`), so the person's own "No molestar" rules decide who still gets through. Returns `false` without access.
- `restore()`: puts the saved mode back and forgets it. Nothing happens when the app did not change the mode.

The saved mode lives in the module's `SharedPreferences`, written before the change. The module restores it by itself when the activity is destroyed and when it is created again, so a recording cut short by Android closing the app leaves "No molestar" on only until the app opens again.

Permission: `android.permission.ACCESS_NOTIFICATION_POLICY`, declared in this module's `AndroidManifest.xml` and merged when the app is built. The JavaScript side is `src/modules/family-timing/data/doNotDisturb.ts`; without the module (iOS, tests, an old build) it does nothing.
