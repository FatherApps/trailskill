# Releasing TrailSkill

Releases, over-the-air updates, and Google Play publishing are done **by the maintainer only**. Contributors and agents never run `eas build --profile production`, `eas submit`, or `eas update`, and never touch Play Console, signing keys, or store credentials.

Workflow rules (branches, commits, pull requests) are in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

Store and tooling rules change. Each requirement below links its official source; re-check those pages before every production release.

## Versioning

- The user-visible version follows [Semantic Versioning](https://semver.org/) in `expo.version`: `MAJOR.MINOR.PATCH`.
  - PATCH: fixes only. MINOR: new features. MAJOR: changes that break users or stored data.
  - The pilot stays on `0.y.z` until the maintainer declares `1.0.0`.
- The Android `versionCode` is managed by EAS, never edited by hand: `cli.appVersionSource` is `"remote"` in `eas.json` and the production profile sets `autoIncrement: true`. ([Expo: app version management](https://docs.expo.dev/build-reference/app-versions/))
- Every store build and every OTA update is traceable to a Git tag:
  - store release: annotated tag `vX.Y.Z`
  - OTA update on top of a store release: `vX.Y.Z+ota.N`

## Build profiles

Created together with the project scaffold in `eas.json`:

| Profile | Purpose | Distribution | Update channel |
| --- | --- | --- | --- |
| `development` | Development client for local work | internal | none |
| `preview` | Builds for team testing | internal | `preview` |
| `production` | Google Play builds (AAB) | store | `production` |

## Standard release from `main`

1. All pull requests for the release are merged and `main` is green.
2. Open a pull request `chore(release): vX.Y.Z` that bumps `expo.version` and updates `CHANGELOG.md` (generated from Conventional Commits).
3. After it merges, tag the merge commit and push the tag:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

4. Build from the tag: `eas build --platform android --profile production`.
5. Submit to the internal testing track: `eas submit --platform android --profile production`.
6. Run the smoke test (see [Release checklist](#release-checklist)) on an internal-track install.
7. Promote in Play Console: internal → closed (pilot) → production with a staged rollout. See [Tracks](#tracks).
8. Publish a GitHub Release for the tag with the changelog notes.

## Hotfixes

- **`main` has no unreleased work:** fix through a normal pull request and release a PATCH version from `main`.
- **`main` already has unreleased work:**
  1. Fix on `main` first through a normal pull request.
  2. Create the release branch from the published tag, if it does not exist: `git switch -c release/X.Y vX.Y.Z`.
  3. Cherry-pick the fix into a branch based on `release/X.Y` and open a pull request into `release/X.Y`.
  4. Tag `vX.Y.(Z+1)` on `release/X.Y` and release from that tag.
- `release/X.Y` branches are protected like `main` and are deleted once the next MINOR version is in production.

## Over-the-air updates (EAS Update)

- Runtime version policy: `appVersion` (Expo's default). An update reaches only builds with the same platform and runtime version. ([Expo: runtime versions](https://docs.expo.dev/eas-update/runtime-versions/))
- OTA is allowed **only** for JavaScript and asset changes. Native code, native dependencies, permissions, or native app config always need a new store build.
- Because the runtime follows `expo.version`, an OTA fix keeps the version unchanged and is tagged `vX.Y.Z+ota.N`.
- Publish to `preview` first, verify on a preview build, then publish the same change to `production`. ([Expo: deploy updates](https://docs.expo.dev/eas-update/deployment/))
- A change in what personal data the app collects or shares requires updating the Data safety form first, whatever the delivery channel.

## Google Play

### One-time setup (maintainer)

- **Account type and production access.** The TrailSkill Play developer account is **personal**. Personal developer accounts created after 13 November 2023 must run a closed test with at least 12 testers opted in for 14 consecutive days before applying for production access. The La Academia pilot runs on the closed testing track and its testers must satisfy this requirement. ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en))
- **Application ID.** A neutral, company-based reverse-domain ID. It cannot change after the first release; the display name can.
- **EAS Submit credentials.** EAS submits with a Google service account key stored in EAS credentials, never in the repository. The first release can be created by `eas submit` on the internal track; a manual first upload is optional. ([Expo: submit to Google Play](https://docs.expo.dev/submit/android/))
- **Target API level.** From 31 August 2026, new apps and app updates must target Android 16 (API level 36) or higher; an extension to 1 November 2026 can be requested. ([Android Developers: target API level](https://developer.android.com/google/play/requirements/target-sdk))

### Store listing and policy

Complete before the first closed-track release and keep up to date:

- [ ] Privacy policy URL.
- [ ] Data safety form, accurate and updated whenever collected or shared data changes. ([Play Console Help: Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en))
- [ ] Target audience and content. If the declared audience includes children, the Families Policy applies: restricted device identifiers, child-directed SDK requirements, and disclosure of data collected from children. ([Play Console Help: Families Policy](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en))
- [ ] Content rating questionnaire.
- [ ] Tester list for the closed track.

### Tracks

| Track | Audience | Use |
| --- | --- | --- |
| Internal testing | Team | Every release candidate. |
| Closed testing | Pilot school testers | Pilot validation; also satisfies the production-access requirement above. |
| Production | Public | Staged rollout (for example 10% → 50% → 100%). Raise the percentage only when crash and error rates stay normal; halt the rollout on a regression. |

## First internal testing release

Step by step for the maintainer, to put the first build in front of testers on the Play **Internal testing** track. Agents prepare this page and the drafts in [`docs/release/`](release/); only the maintainer runs the commands below, because they touch Expo, EAS credentials, and Play Console.

Nothing here puts the app in front of the public: Internal testing is limited to the testers you list (up to 100).

### Before you start

- [ ] An Expo account with the TrailSkill project created on expo.dev. Copy its **project ID** (not a secret) and the **owner** (the account or organization that owns the project).
- [ ] The EAS project ID and owner are still missing from `app.config.ts` on purpose: an invalid ID breaks every EAS command, `development` profile included. Add both in the same pull request that carries this guide, once you have the real values:

  ```ts
  owner: '<expo account or organization>',
  extra: { eas: { projectId: '<project id from expo.dev>' } },
  ```

- [ ] A Google Play developer account (personal) with access to Play Console.
- [ ] The drafts in [`docs/release/`](release/) reviewed. They are drafts: the privacy policy needs the legal review of issue #106 before it is published anywhere.

`LEGAL_REVIEW_PENDING` stays `true` for this release. The [Release checklist](#release-checklist) forbids only **production** while it is `true`; Internal and Closed testing are not production.

### 1. Build variables in EAS (once)

The app reads three public values at build time. They never go in the repository: `eas.json` has no `EXPO_PUBLIC_*` value, and the `production` build profile reads the EAS environment named `production`.

Create each variable in that environment. Leave out `--value`, so the CLI asks for it and the value stays out of your shell history and of this repository (if your `eas-cli` rejects the missing value, pass it with `--value` from your own terminal only):

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_POWERSYNC_URL --environment production --visibility plaintext
```

- Use the values of the **production** backend, not the test one.
- `plaintext` is the right visibility: everything with the `EXPO_PUBLIC_` prefix is inlined into the app and readable by anyone who installs it. The Supabase anon key is public by design; row-level security is what protects the data. Never put a service-role key or any other secret in an `EXPO_PUBLIC_*` variable.
- Check them with `eas env:list --environment production`. If your `eas-cli` no longer has `env:create`, the equivalent in current Expo docs is `eas env:set` with the same flags ([Expo: environment variables](https://docs.expo.dev/eas/environment-variables/)).

### 2. Create the app in Play Console

1. Play Console → **Create app**. Name: TrailSkill. Default language: Spanish. Type: App, Free.
2. Package name: `com.fatherapps.trailskill`. It cannot change after the first upload (see [One-time setup](#one-time-setup-maintainer)).
3. Accept **Play App Signing** (the default for new apps). Google keeps the app signing key; EAS generates and keeps the upload key in its credentials.
4. Fill the declarations Play asks for before any closed test, using the drafts as the starting point:
   - Store listing: [`docs/release/play-listing.es.md`](release/play-listing.es.md).
   - Data safety: [`docs/release/data-safety.md`](release/data-safety.md).
   - Privacy policy URL: the published version of [`docs/release/privacy-policy.es.md`](release/privacy-policy.es.md) (needs a public URL and the legal review of #106 first).
   - Content rating questionnaire and target audience (see Open decisions: the app stores minors' data while its users are adults).

### 3. Build the AAB

Run it from a clean checkout of the commit you want to test, with the EAS variables above in place:

```bash
eas build --profile production --platform android
```

- The first run asks to generate an upload keystore: accept, and let EAS keep it.
- `autoIncrement` raises the `versionCode` by itself ([Versioning](#versioning)).
- **Target API level.** The bundle must target Android 16 (API level 36) or higher; Play rejects it otherwise. Before uploading, confirm the value that the installed React Native version sets (`rg -n targetSdk node_modules/react-native/gradle/libs.versions.toml` after `npm ci`) and re-check the [official requirement](https://developer.android.com/google/play/requirements/target-sdk) for the date of the upload. Never lower `targetSdkVersion`.

### 4. Upload to Internal testing

1. Download the `.aab` from the EAS build page.
2. Play Console → **Testing → Internal testing → Create new release** → upload the `.aab`. Add a release name (for example the `expo.version`) and short release notes.
3. Review and roll out. Internal testing releases are available to testers within minutes, with no Google review of the app content.

A manual upload keeps the first release free of service-account credentials. `eas submit` for later releases is covered in [Standard release from `main`](#standard-release-from-main).

### 5. Testers and opt-in link

1. **Testing → Internal testing → Testers** → create an email list (for example "Internal team") and add each tester's Google account email.
2. Copy the **opt-in link** from the same page and send it to the testers. Each tester opens it **signed in with the listed Google account**, accepts, and then installs the app from the Play Store link that follows.
3. Testers who changed their Google account or skipped the opt-in step will see "item not found": ask them to open the opt-in link again.

### 6. Smoke test

Run the smoke test of the [Release checklist](#release-checklist) on a device installed from the Internal testing track.

### 7. Access for Play reviewers

Play may ask for sign-in credentials in **App content → App access** (the app asks for a sign-in on first launch). Reviewers cannot read a stranger's email, so the emailed code is not enough for them. Decided by the maintainer (issue #910):

- **Use a dedicated Google account** (Google sign-in is enabled in production and does not depend on #84). Create it for the review only, with no 2-step verification that needs a phone, and use only synthetic data in the athletes it manages. Mario creates and keeps it; **its email and password go only in the App access form of Play Console, never in the repository, an issue, or a pull request.**
- Microsoft sign-in (the sign-in screen has a button for it) is **to be confirmed by Mario**: this guide does not say whether it is enabled in production. Do not use it for the review account until he confirms.
- **Backup:** a dedicated mailbox for the review, whose address and password go in the same form. The reviewer opens that mailbox to read the emailed code, so keep it free of 2-step verification and send the code only when the reviewer asks.
- Not allowed: a fixed-code or other authentication shortcut on the server.

Before the closed test, sign in once with the dedicated account on an Internal testing install and check that it reaches the home screen.

### 8. What Play requires before a closed test

Closed testing is the track that counts for production access. Before moving there:

- **Target API level 36 or higher** on every build, as AGENTS.md requires ([source](https://developer.android.com/google/play/requirements/target-sdk)).
- **At least 12 testers opted in for 14 consecutive days.** The TrailSkill Play developer account is personal, so Play asks for a closed test with this many testers before it grants production access ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)). Keep the 14 days unbroken: a tester who opts out lowers the count.
- Completed store listing, privacy policy URL, Data safety form, content rating, and target audience declaration ([Store listing and policy](#store-listing-and-policy)).
- The App access form filled in with the dedicated review account ([step 7](#7-access-for-play-reviewers)).
- Open decisions settled and closed, because each one changes what the forms must say:
  - **Data deletion.** The app has no way to delete an account or its data, and Play asks apps that create accounts for a deletion path in the app and on the web. Decide between a request by email (stated in the privacy policy) and building it.
  - **Target audience** and Families Policy applicability (the app stores minors' data while its users are adults; see [Open decisions](#open-decisions)).
  - **Legal review** of the authorization texts and the privacy policy (issue #106). The privacy policy needs it before it gets a public URL.

## Test builds (debug-signed APK)

An installable APK for walking through the app against the test backend, without Google Play or EAS. It is built locally, signed with the **debug key** that Expo's generated Android project ships, and never uploaded anywhere. It is not a release: never publish it, and never sign a store build this way.

**Preview variant.** Build with `APP_VARIANT=preview` and `app.config.ts` gives the APK its own identity, so it installs next to the development client (and the Play build) instead of replacing it. Without `APP_VARIANT` the configuration is unchanged.

| | Usual | `APP_VARIANT=preview` |
| --- | --- | --- |
| Package | `com.fatherapps.trailskill` | `com.fatherapps.trailskill.preview` |
| Name | TrailSkill | TrailSkill (prueba) |
| Scheme | `trailskill` | `trailskill-preview` |

Requirements: JDK, the Android SDK (`ANDROID_HOME` set), and `adb` with an emulator or device attached. No EAS account, release keystore, or Play credentials are involved.

1. Install dependencies: `npm ci`.
2. Export the backend variables in the shell that runs the build. Get the values from the maintainer; they are inlined into the JavaScript bundle at build time and must never be committed or written to a tracked file (`.env*` is git-ignored).

   ```bash
   export EXPO_PUBLIC_SUPABASE_URL=<test backend URL>
   export EXPO_PUBLIC_SUPABASE_ANON_KEY=<test backend anon key>
   export EXPO_PUBLIC_POWERSYNC_URL=<test PowerSync URL>
   export APP_VARIANT=preview
   ```

   If the maintainer keeps the three `EXPO_PUBLIC_*` values in a file outside the repository, load them with `set -a; . <file>; set +a`. Check that each is set and not empty without printing it, for example `test -n "$EXPO_PUBLIC_SUPABASE_URL"`. Never print, copy, or commit that file.

3. Generate the native project (`android/` is git-ignored) and build the release variant. Add `-PreactNativeArchitectures=<abi>` to build one ABI and finish faster; use the one that `adb shell getprop ro.product.cpu.abi` reports (`arm64-v8a` on phones and on Apple-silicon emulators, `x86_64` on Intel emulators):

   ```bash
   npx expo prebuild --platform android --clean
   cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
   ```

   The APK is `android/app/build/outputs/apk/release/app-release.apk`. The release build type uses `signingConfigs.debug`, and `targetSdkVersion` comes from React Native (36 or higher; re-check it after each Expo upgrade, see [Google Play requirements](../AGENTS.md#google-play-requirements)).

4. Install and open it without Metro:

   ```bash
   adb -s <device> install android/app/build/outputs/apk/release/app-release.apk
   adb -s <device> shell monkey -p com.fatherapps.trailskill.preview -c android.intent.category.LAUNCHER 1
   ```

   The preview package differs from the development client's, so a plain `install` leaves the client untouched: do not use `-r` and do not uninstall anything. Only if you build without `APP_VARIANT=preview` does the APK share the client's package and debug key, and `-r` then replaces the client (reinstall it with `npx expo run:android` or an EAS `development` build).

5. Smoke test: the app opens with no Metro server running, signs in with a demo account, and shows synced data.

Sign-in by one-time code works in the preview variant as is. To sign in with Google or another OAuth provider, the preview variant needs `trailskill-preview://auth-callback` in `ADDITIONAL_REDIRECT_URLS` of the backend it points to (production today), next to `trailskill://auth-callback`. Without it, GoTrue falls back to `SITE_URL` and the browser ends on that page instead of returning to the app. This is a maintainer step on the server, not a change in this repository.

School invitation links do not open the preview variant. A link such as `trailskill://invite/<token>` belongs to the app whose scheme is `trailskill` (the usual build and the Play build); the preview app (`com.fatherapps.trailskill.preview`) answers only to `trailskill-preview://`. To test an invitation in the preview variant, open `trailskill-preview://invite/<token>` by hand, for example `adb shell am start -a android.intent.action.VIEW -d "trailskill-preview://invite/<token>"`.

A build without the three variables still opens, but sign-in and sync report a missing configuration. Rebuild after changing any `EXPO_PUBLIC_*` value, because they are inlined at build time.

## Release checklist

- [ ] `main` (or `release/X.Y`) is green and the tag points to the built commit.
- [ ] `CHANGELOG.md` and the GitHub Release notes are written.
- [ ] Smoke test on an internal-track install: sign in as a guardian, register an athlete, record a training time offline, reconnect and confirm sync.
- [ ] Data safety form still matches what the app collects and shares.
- [ ] Target API level meets the current Play requirement.
- [ ] No debug flags, test accounts, or synthetic seed data in the production build.
- [ ] `LEGAL_REVIEW_PENDING` in `src/modules/accounts/legalReview.ts` is `false` and issue #106 (legal review of the authorization texts) is closed: never publish to production while it is `true`.

## Open decisions

To be settled by the maintainer before the first Play release:

- Final application ID.
- Target audience declaration and Families Policy applicability (needs legal advice: the app stores minors' data while its users are adults).
- Owner and hosting of the privacy policy.
- Staged-rollout percentages and the metrics that gate each step.
