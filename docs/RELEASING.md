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

## Release checklist

- [ ] `main` (or `release/X.Y`) is green and the tag points to the built commit.
- [ ] `CHANGELOG.md` and the GitHub Release notes are written.
- [ ] Smoke test on an internal-track install: sign in as a guardian, register an athlete, record a training time offline, reconnect and confirm sync.
- [ ] Data safety form still matches what the app collects and shares.
- [ ] Target API level meets the current Play requirement.
- [ ] No debug flags, test accounts, or synthetic seed data in the production build.

## Open decisions

To be settled by the maintainer before the first Play release:

- Final application ID.
- Target audience declaration and Families Policy applicability (needs legal advice: the app stores minors' data while its users are adults).
- Owner and hosting of the privacy policy.
- Staged-rollout percentages and the metrics that gate each step.
