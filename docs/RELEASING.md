# Releasing Swimcro

Releases, over-the-air updates, and Google Play publishing are done **by the maintainer only**. Contributors and agents never run `eas build --profile production`, `eas submit`, or `eas update`, and never touch Play Console, signing keys, or store credentials. A release tag `vX.Y.Z` starts the delivery by itself through the [release workflow](#standard-release-from-main); nobody runs those commands by hand for a normal release.

Workflow rules (branches, commits, pull requests) are in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

Store and tooling rules change. Each requirement below links its official source; re-check those pages before every production release.

## Versioning

- The user-visible version follows [Semantic Versioning](https://semver.org/) in `expo.version`: `MAJOR.MINOR.PATCH`.
  - PATCH: fixes only. MINOR: new features. MAJOR: changes that break users or stored data.
  - The pilot stays on `0.y.z` until the maintainer declares `1.0.0`.
- The Android `versionCode` is managed by EAS, never edited by hand: `cli.appVersionSource` is `"remote"` in `eas.json` and the production profile sets `autoIncrement: true`. ([Expo: app version management](https://docs.expo.dev/build-reference/app-versions/))
- Every store build and every OTA update is traceable to a Git tag:
  - release: lightweight tag `vX.Y.Z`, created by release-please when its release pull request merges ([Standard release](#standard-release-from-main)). Pushing it starts the release workflow, which delivers it as a Play build or as an OTA update (below)
  - manual OTA fix on top of a release: `vX.Y.Z+ota.N`, a manual annotated tag that never starts the workflow ([OTA tags](#tags))

### A version delivered by OTA

`vX.Y.Z` is the version of the release, whichever way it is delivered. When the release workflow finds a production build with the same fingerprint, it publishes an OTA update (message `vX.Y.Z`) instead of a new build. Then:

- The native `versionName` on the phones stays the one of the last store build: with the default `balanced` fingerprint preset a version bump does not change the fingerprint, so the build keeps its runtime. ([Expo: fingerprint presets](https://docs.expo.dev/versions/latest/sdk/fingerprint.md#fingerprintpreset))
- The minimum-version gate (#1189) compares `Application.nativeApplicationVersion` (`src/modules/settings/screens/VersionGate.tsx:38`), which is that native version. `app_versions.min_version` and `app_versions.latest_version` must only ever hold versions **of store builds**, never a version that was delivered by OTA: the gate would block people who already run that code.

## Build profiles

Created together with the project scaffold in `eas.json`:

| Profile | Purpose | Distribution | Update channel |
| --- | --- | --- | --- |
| `development` | Development client for local work | internal | none |
| `preview` | Builds for team testing | internal | `preview` |
| `qa` | Same build as `preview` (extends it), for the last OTA stage before production | internal | `qa` |
| `production` | Google Play builds (AAB) | store | `production` |

## Backend environments and release order

There are two backends, described in [`deploy/README.md`](../deploy/README.md#environments) and the [2026-11-16 amendment of ADR 0002](decisions/0002-backend-hosting-on-dokploy.md#amendment-2026-11-16-qa-and-prod-environments-email-provider-and-backups):

- **QA** is the deployment that exists today. It deploys from `main` on every push, so a migration reaches it as soon as its pull request merges. It holds demo data.
- **PROD** is a separate deployment that starts empty and receives no data from QA. It deploys only from a release tag `vX.Y.Z` that the maintainer starts, never from a push to `main`. It does not exist yet; it is built by the issues #1115 to #1118.

### Which backend each build uses

The app takes its three public values (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_POWERSYNC_URL`) from the EAS environment at build time. The maintainer sets them in the EAS interface; they are never in the repository and agents never see them.

| Build | EAS environment | Backend |
| --- | --- | --- |
| `development` (and local runs) | None (see [Local development](local-development.md)) | Local, or QA |
| `preview`, and the [debug-signed test APK](#test-builds-debug-signed-apk) | Not `production` | QA |
| `qa` | Not `production` | QA |
| `production` (Google Play) | `production` | **QA until the cut to PROD**, then PROD |

Today the EAS `production` environment still holds the QA values (see [State on 16 November 2026](#state-on-16-november-2026)), so the Play build talks to QA. The cut below changes that. An OTA update carries the values of the environment it was published from ([channels and environments](#channels-builds-and-environments)).

### Order for each version

Once PROD exists, a release goes in this order and never in another:

1. **Tag.** `vX.Y.Z` on the merge commit of the release pull request. release-please creates it when that pull request merges ([Standard release](#standard-release-from-main)).
2. **Migrate PROD from the tag.** The backend always goes first. PROD deploys from the tag, through the `production` branch ([mechanism and rollback](deploy/prod-deploy-compose.md)); read the `migrate` log and confirm it exited 0. If the release changes an Edge Function, deliver it too, as in [Edge Functions](../deploy/README.md#edge-functions).
3. **Delivery from the same tag.** The release workflow builds and submits (or publishes the OTA update) from the tag ([Standard release](#standard-release-from-main)). It starts when the tag is pushed, so once PROD exists it must wait for step 2: the cut to PROD (#1120) adds a `require-approval` job (pre-packaged, no parameters) before `update` and `build`. The maintainer approves it in the run on expo.dev after migrating PROD from the tag. Today there is no gate, because PROD does not exist and the builds use QA.
4. **Smoke test, then promote** through the tracks.

Why the backend first, and what that demands of migrations:

- Migrations are forward-only: an applied migration is never edited or reverted; a mistake is fixed by a new migration ([Rolling back](../deploy/README.md#rolling-back)).
- Phones keep running the previous build for days. Use expand, then contract: a release first adds what the new build needs while keeping what the old build still uses; a later release removes the old shape, only after the build that no longer needs it is out and adopted. The `results-import` claim change (#896, contract #931) is the example in [Edge Functions](../deploy/README.md#edge-functions).
- QA runs ahead of PROD, because it migrates on every merge. Use it to see a migration work on real shapes before the tag, but QA passing does not replace the PROD check in step 2.

### Cut to PROD (once)

The first time, the Play build changes backend from QA to PROD (#1120). Preconditions: PROD is built and checked (#1115 to #1118) and the read-only checks of #1113 are approved. The cut is done by the maintainer; agents never run a production build, `eas submit`, or touch EAS or Play credentials.

1. **Confirm PROD is ready**: its services are healthy, its first school administrator exists (#1118), and `APPLY_SEED` is `false`.
2. **Change the EAS values.** In the EAS interface, replace the three `production` values with the PROD ones (`swimcro-api`, `swimcro-sync`, and the anon key issued for PROD). `preview` and test builds stay on QA. The maintainer confirms in #1120, in writing and without transcribing the values, that the environment holds PROD values.
3. **Add the approval gate, then tag, migrate PROD, deliver** in the [order above](#order-for-each-version). The cut adds the `require-approval` job to `.eas/workflows/release.yml` before it can run with PROD values; the release workflow then submits to the **Internal testing** track.
4. **Smoke test on a phone, internal team only** ([Release checklist](#release-checklist)): sign in with Google and with the emailed code, sync, and invite a coach. QA accounts do not exist in PROD and register again; check that a QA account cannot sign in to PROD.
5. **Record the result** in #1120 (evidence without personal data).

The earlier proposal to bump `expo.version` for the PROD build no longer applies: with the fingerprint policy, bumping `expo.version` does not change the runtime, and a build that points to QA has the same fingerprint as one that points to PROD, so the cut to PROD relies on the EAS environment used at publish time ([channels and environments](#channels-builds-and-environments)); #1120 keeps its scope.

Real families are **not** invited to PROD until an off-server backup and a tested restore exist (#1119, [ADR 0002 amendment](decisions/0002-backend-hosting-on-dokploy.md#amendment-2026-11-16-qa-and-prod-environments-email-provider-and-backups)). The cut itself does not open PROD to them.

## Standard release from `main`

[release-please](https://github.com/googleapis/release-please-action) (workflow [`release-please.yml`](../.github/workflows/release-please.yml), configured in `release-please-config.json` and `.release-please-manifest.json`) keeps one pull request `chore(release): vX.Y.Z` open on `main`. It bumps `expo.version` in `app.config.ts` (the line marked `x-release-please-version`) and `package.json`, and writes `CHANGELOG.md` from the Conventional Commits that merged since the last release. Normal pull requests never create a tag. Because the pull request titles become the squash commits on `main`, a good title is a good changelog line ([`CONTRIBUTING.md`](../CONTRIBUTING.md#pull-requests)).

1. All pull requests for the release are merged and `main` is green.
2. Review the release pull request that release-please keeps open: the version, and the `CHANGELOG.md` entries. Its title must stay `chore(release): vX.Y.Z`. Squash-merge it (maintainer).
3. Merging creates the lightweight tag `vX.Y.Z` on the merge commit and the GitHub Release with the changelog notes. Nobody tags by hand.
4. Pushing the tag starts the **release workflow**, [`.eas/workflows/release.yml`](../.eas/workflows/release.yml), made only of pre-packaged Expo jobs, Android only ([Expo: pre-packaged jobs](https://docs.expo.dev/eas/workflows/pre-packaged-jobs/)). Merging a normal pull request never starts it. It runs these jobs:
   - `fingerprint`: computes the Android fingerprint of the tag.
   - `get_build` (`get-build`): looks for a production build with that fingerprint.
   - Found: `update` publishes an OTA update to the `production` channel from the EAS `production` environment, with the message `vX.Y.Z` ([A version delivered by OTA](#a-version-delivered-by-ota)).
   - Not found (native code changed, or the first release after #1188, because the 0.1.0 build has no `expo-updates`): `build` makes the production build and `submit` sends it to the Internal testing track (`submit.production.android` in `eas.json`).
   - A tag `vX.Y.Z+ota.N` never starts it. A manual hotfix tag `vX.Y.Z` on `release/X.Y` does, because it is a release.
5. Migrate PROD from the tag, once PROD exists, before the workflow delivers ([Order for each version](#order-for-each-version)). Until the cut, the build uses QA, which already migrated when its pull requests merged.
6. Follow the run on expo.dev, and check which route it took: `update`, or `build` then `submit`. A failed build or submit reaches no user. Recover on expo.dev with **Re-run workflow** → **Re-run from failed jobs**, which reuses the successful build and retries only the failed job ([Expo: re-run a workflow](https://docs.expo.dev/eas/workflows/manage-workflow-runs/#re-run-a-workflow)). **Never use "Re-run all jobs" (or `eas workflow:run`) after a build that succeeded but whose submit failed:** `get_build` would find that never-submitted build, the run would take the OTA route and finish green, and no phone would receive the store bundle.
7. Run the smoke test (see [Release checklist](#release-checklist)). After a build, use an internal-track install; after an OTA update, restart the app on a phone with the previous build.
8. After a build, promote in Play Console: internal → closed (pilot) → production with a staged rollout. See [Tracks](#tracks).

**Accepted risk.** The OTA route skips the internal track and reaches every pilot user at once, at 100 % (the maintainer chose this on 2026-11-19). The only protection is the fingerprint check: JavaScript-only changes. Undo it with [Roll back an automatic OTA](#roll-back-an-automatic-ota).

**Production builds come only from this workflow.** `get-build` matches any production build with the same fingerprint. A production build that was never submitted, whether hand-made or left by a run whose submit failed, would make a later release (or a full re-run) publish an OTA update for a runtime nobody installed. Never run `eas build --profile production` by hand, and finish a failed submit with "Re-run from failed jobs".

### First run: `v0.2.0` was tagged before the workflow existed

The tag `v0.2.0` (merge commit `90850ff`) was pushed before `.eas/workflows/release.yml` reached `main`, so it started nothing, and it never will. Facts, checked with `git ls-tree` and `git show` on the tag and against the [Expo docs](https://docs.expo.dev/eas/cli/#eas-workflowrun-file):

- The tag has no `.eas/workflows/release.yml` and no `submit.production.android` in `eas.json`, and its `app.config.ts` still says `owner: 'fatherapps'` (the project now lives in `fatherapps-teams-co`).
- `eas workflow:run FILE` packages and uploads the **local project directory** unless `--ref` is given, and the run then has no branch or commit. `--ref` is documented only as «Git reference to run the workflow on»; the docs do not say whether the workflow file is then read from that ref. `--git-branch` and `--git-commit-hash` only label the run; the run still uses the uploaded files. Manual runs are documented for the CLI and the REST API; the docs describe no «Run workflow» button (the dashboard only re-runs an existing run).
- `main` already has commits after the tag (`git log v0.2.0..origin/main`): #1198 (tooling) and #1200, which adds a **native** module (`modules/do-not-disturb/`, Android manifest). A manual run from `main` therefore builds code that is not `v0.2.0` and includes that module.
- A manual run does not follow «build from the tag»: from a checkout of `v0.2.0` it fails for lack of the workflow file; from `main` it builds `main`. Only the maintainer creates or moves tags.

Options for the maintainer (agents run none of them):

1. **Wait for the next release-please release** (recommended). The workflow is then in the tag, the first run is the normal tag push, and every rule here holds. Nothing is lost: `v0.2.0` was never on Play, and 0.1.0 stays on the internal track.
2. **Run it by hand against `main`**, accepting that the build is `main` and not `v0.2.0`: `eas workflow:run .eas/workflows/release.yml --git-branch main --git-commit-hash "$(git rev-parse HEAD)"` from an up-to-date checkout of `main` (the last two flags only label the run). Record the commit that was built in the release notes. A manual run has no tag, so `github.ref_name` is empty and an OTA update would lose its `vX.Y.Z` message; the first run takes the build route anyway, because no build has the new fingerprint.
3. Move or create a tag: not an option for agents, and moving `v0.2.0` would break the rule that the tag is the merge commit of the release pull request.

The release pull request is exempt from the PR description check and from the delivery box check, only when its head branch is `release-please--branches--main--components--trailskill` and its title is `chore(release): vX.Y.Z`; it always needs a Play build ([`CONTRIBUTING.md`](../CONTRIBUTING.md#required-checks)). Every other check runs on it unchanged.

## Hotfixes

- **`main` has no unreleased work:** fix through a normal pull request and release a PATCH version from `main`.
- **`main` already has unreleased work:**
  1. Fix on `main` first through a normal pull request.
  2. Create the release branch from the published tag, if it does not exist: `git switch -c release/X.Y vX.Y.Z`.
  3. Cherry-pick the fix into a branch based on `release/X.Y` and open a pull request into `release/X.Y`.
  4. Tag `vX.Y.(Z+1)` on `release/X.Y` by hand and push it: the [release workflow](#standard-release-from-main) delivers it like any release. release-please runs only on `main`, so hotfix tags stay manual.
- `release/X.Y` branches are protected like `main` and are deleted once the next MINOR version is in production.

## Over-the-air updates (EAS Update)

### Runtime version: fingerprint

- `app.config.ts` sets `runtimeVersion: { policy: 'fingerprint' }`. The runtime is a hash of the native project: native dependencies, config plugins, and native app config. An update reaches only builds with the same platform and fingerprint. ([Expo: runtime versions](https://docs.expo.dev/eas-update/runtime-versions/))
- `expo.version` is only the user-visible version. Changing it does not change the runtime.
- OTA is allowed **only** for JavaScript and asset changes. These always need a new Play build:
  - native code, native dependencies, permissions, or native app config;
  - Supabase migrations (`supabase/migrations/**`) or sync rules (`powersync/sync-config.yaml`). An OTA must not change the app's relationship with the backend.
- A change in what personal data the app collects or shares requires updating the Data safety form first, whatever the delivery channel.

### Channels, builds, and environments

Each build listens to one channel. An update carries the `EXPO_PUBLIC_*` values of the EAS environment it is published from, so publish from the environment of the channel's row. ([Expo: environment variables](https://docs.expo.dev/eas/environment-variables/))

| Channel | Build profile | Artifact | EAS environment | Backend |
| --- | --- | --- | --- | --- |
| `preview` | `preview` | Internal APK | Not `production` | QA |
| `qa` | `qa` (extends `preview`) | Internal APK | Not `production` | QA |
| `production` | `production` | Play AAB | `production` | QA until the cut to PROD (#1120), then PROD |
| none | `development` | Development client | None | Local, or QA |

### Staged deployment

Publish the same change in this order, and move on only when the previous stage is verified on a build of that channel. ([Expo: deploy updates](https://docs.expo.dev/eas-update/deployment/))

1. `preview`: publish, then verify on a preview build.
2. `qa`: publish the same change, then verify on a `qa` build.
3. `production`: publish with a rollout percentage, for example `eas update --channel production --rollout-percentage 10`. Raise it with `eas update:edit` only while crash and error rates stay normal. To undo it, run `eas update:rollback` or publish the previous version again. ([Expo: rollouts](https://docs.expo.dev/eas-update/rollouts/))

This staged path is for manual fixes. The [release workflow](#standard-release-from-main) publishes the automatic OTA update straight to `production` at 100 %, with no `preview` or `qa` stage. Only the maintainer runs `eas update` by hand; agents never do.

### Roll back an automatic OTA

If an update that the release workflow published breaks the app, the maintainer runs one of these (agents never run either):

- `eas update:rollback` on the `production` channel, or
- `eas update:republish` of the previous update group. ([Expo: `eas update:rollback` and `eas update:republish`](https://docs.expo.dev/eas/cli/))

The tag and the GitHub Release of the reverted version stay. The fix goes out as the next PATCH version through the same workflow. A failed build or submit reaches no user; recover it as in [Standard release](#standard-release-from-main), step 6.

### Tags

Every manual OTA fix on top of the release `vX.Y.Z` is tagged `vX.Y.Z+ota.N` on the published commit. The version stays unchanged. These tags stay manual and annotated: release-please does not create them and the release workflow ignores them. They must **never** have a GitHub Release, because release-please could read one as the latest version and compute the next release from it. An OTA update published by the release workflow itself needs no `+ota.N` tag: its tag is `vX.Y.Z`.

### Pull request classification

Every pull request is classified before it opens, with the delivery checkbox of #1186: «Apto para OTA» or «Requiere build de Play». Only pull requests marked «Apto para OTA» may ship by OTA. The CI check [`.github/scripts/check-ota.sh`](../.github/scripts/check-ota.sh) compares the checkbox with the diff and rejects «Apto para OTA» when the diff touches a build path (see [`CONTRIBUTING.md`](../CONTRIBUTING.md#required-checks)).

### The 0.1.0 build never receives OTA

The 0.1.0 build on Play Internal testing predates `expo-updates`, so it has no update client. The first build that can receive an OTA update is the next Play build that includes #1188.

## Google Play

### One-time setup (maintainer)

- **Account type and production access.** The Swimcro Play developer account is **personal**. Personal developer accounts created after 13 November 2023 must run a closed test with at least 12 testers opted in for 14 consecutive days before applying for production access. The La Academia pilot runs on the closed testing track and its testers must satisfy this requirement. ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en))
- **Application ID.** A neutral, company-based reverse-domain ID. It cannot change after the first release; the display name can.
- **EAS Submit credentials.** EAS submits with a Google service account key stored in EAS credentials, never in the repository. The first release can be created by `eas submit` on the internal track; a manual first upload is optional. ([Expo: submit to Google Play](https://docs.expo.dev/submit/android/))
- **Release workflow (#1209).** The Expo project `swimcro` lives in the Expo organization `fatherapps-teams-co` (moved from the personal `fatherapps` account on 2026-11-19; the project ID and the upload keystore did not change). Expo's GitHub app only delivers tag pushes to an organization project, which is why. Three one-time steps, done by the maintainer; agents never touch them:
  1. **Done on 2026-11-19:** the GitHub repository is linked to the EAS project (Expo's GitHub app, base directory `/`), so that tag pushes reach EAS Workflows. Expo shows the workflow as «Unconfigured» until `.eas/workflows/release.yml` is on `main`. ([Expo: automate workflows with GitHub events](https://docs.expo.dev/eas/workflows/get-started/))
  2. **Done on 2026-11-19:** the key of the Play service account is uploaded to the EAS credentials (it submits only to the testing tracks).
  3. **To check:** confirm the EAS `production` environment holds the backend values the build must use (QA until the cut to PROD, #1120).

  Changing `owner` in `app.config.ts` changes the fingerprint (the `balanced` preset does not skip it), so builds made before 2026-11-19 do not match the new source; the first release after #1188 takes the build route anyway.
- **Automatic release pull request (release-please, #1202).** Two one-time steps, done by the maintainer; agents never create, read or store the token:
  1. Create a fine-grained personal access token limited to this repository, with **Contents** and **Pull requests** read and write (or a GitHub App with the same permissions), and save it as the repository secret `RELEASE_PLEASE_TOKEN`. Write down its expiry date and how to renew it (a new token, then replace the secret) in the maintainer's own notes; until the secret exists, the workflow cannot open the release pull request. A personal token is needed because pull requests and tags created with `GITHUB_TOKEN` do not start other workflows, so the checks of the release pull request would not run.
  2. Give the SHA of the commit of the 0.1.0 Play build (from the EAS build page). It goes into `release-please-config.json` as `"bootstrap-sha"`, so the first changelog starts after that build and not at the first commit. **Order matters:** merging the pull request that adds the workflow (#1203) is already its first run on `main`, and it fails without the secret; that failure is expected. Add `"bootstrap-sha"` in a small separate pull request **before** creating `RELEASE_PLEASE_TOKEN`: once the secret exists, the next push to `main` opens the first release pull request, and without the field its `CHANGELOG.md` would cover the whole history. The field is set to `67e729d3f962e00f2f97d0c95e914bddf084f9a9` (#1167), the commit of the 0.1.0 Play build, so the first changelog covers only the commits of `main` after it. The maintainer still has to create the `RELEASE_PLEASE_TOKEN` secret after this change is merged.
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

Step by step to put the first build in front of testers on the Play **Internal testing** track. Agents prepare this page and the drafts in [`docs/release/`](release/); only the maintainer runs the commands below, because they touch Expo, EAS credentials, Play Console, and Dokploy. Every step says **who** does it and **where**.

Nothing here puts the app in front of the public: Internal testing is limited to the testers you list (up to 100), and Play does not review the app for this track. Play states that you can start an internal test before completing the app setup, and that apps active only on internal testing tracks are exempt from the Data safety section ([Play Console Help: set up a test](https://support.google.com/googleplay/android-developer/answer/9845334)). What Play asks before the closed test is in [What Play asks, track by track](#what-play-asks-track-by-track).

### State on 16 November 2026

Read this before the steps. Each line is a fact checked in this repository or in the issue tracker on that date; re-check the open ones.

| Topic | State | Consequence |
| --- | --- | --- |
| Backend | One deployment exists: the one in [`deploy/README.md`](../deploy/README.md), which the preview APK already uses. This guide calls it **QA**. The planner is designing a separate **PROD** that starts empty (no copy of QA data). | The first build points to QA. |
| EAS `production` environment | **Temporarily holds the QA values.** The `production` build profile in `eas.json` reads that environment, so the Play build talks to QA. | Replace the three values with PROD ones and ship a new build when PROD exists. Anything the testers create in QA is not carried to PROD. |
| Secret rotation (#914) | **Open**, no comments, last updated 3 November 2026. | **Blocks today**, see step 1. |
| Sign-in by emailed code | Auth sends the code through Resend. This is **confirmed by Mario and the maintainer (2026-11-15)**: codes for `@example.test` stopped reaching Mailpit. The repository does not show it (the SMTP host is a redacted Dokploy variable). | Second sign-in path. Test it with a real address before inviting testers, step 4. |
| Sign-in with Google | The maintainer verified authorize, provider, callback in the auth logs (see [`data-safety.md`](release/data-safety.md)). #84 (Google and Microsoft in the self-hosted auth) is still open. | Main sign-in path. Test it on the preview APK before building, step 4. |
| Expo project | Exists: slug `swimcro`, owner `fatherapps-teams-co`. `app.config.ts` links it with `owner` and `extra.eas.projectId` (#1160). | Nothing to create. Step 2 keeps only the EAS variables. |
| App name and package | Swimcro, `com.fatherapps.swimcro` (#1097). Logo and wordmark are pending (#1099). | The store listing can use the current icon; the graphics are the maintainer's. |
| `expo.version` | `0.1.0` (the pilot stays on `0.y.z`, see [Versioning](#versioning)). The Android `versionCode` is still managed by EAS. | The first upload is `0.1.0`. |

### Before you start

- [ ] A Google Play developer account (personal) with access to Play Console.
- [x] The Expo project already exists (slug `swimcro`, owner `fatherapps-teams-co`) and `app.config.ts` links it (#1160). You need access to that account to run `eas`.
- [ ] A device with the Play Store signed in with a Google account, for the smoke test.
- [ ] The drafts in [`docs/release/`](release/) reviewed. They are drafts: the privacy policy needs the legal review of issue #106 before it is published anywhere.

`LEGAL_REVIEW_PENDING` stays `true` for this release. The [Release checklist](#release-checklist) forbids only **production** while it is `true`; Internal and Closed testing are not production.

### 1. Secret rotation (#914): does it block?

**Who:** Mario, on Dokploy and Vault. **No agent does this step.**

**Conclusion: yes, #914 blocks today.**

Evidence:

- #914 is open with no comments or closing note (last update 3 November 2026), so there is no record that the exposed secrets were rotated. Its acceptance criteria require the new `ANON` key to reach the EAS `production` variables.
- It concerns the secrets of the compose in `deploy/` (database password, `SUPABASE_JWT_SECRET`, both PowerSync passwords). That compose is the only deployment this repository documents, and it is the backend the EAS variables will point to in step 2.
- The anon key that goes into the build is a JWT signed with `SUPABASE_JWT_SECRET`. If that secret was exposed, anyone with it can mint tokens for this backend, including `service_role`. A public build must not ship the key of such a backend.
- Rotating the JWT secret **after** the build invalidates the anon key inside every installed app: testers would need a new build. Rotate first.

What lifts the block:

- Preferred: complete #914 first, as that issue describes, and use the **new** anon key in step 2.
- Alternative: Mario confirms in #914, in writing and without values, that the exposed secrets belong to a deployment other than the one the EAS variables point to. This guide cannot tell that from the repository, so it does not guess.
- Waiving the block and accepting the risk is the maintainer's decision, recorded in #914. No agent decides it.

### 2. EAS variables

**Who:** Mario, on expo.dev and in his own terminal.

**The project.** It already exists (slug `swimcro`, owner `fatherapps-teams-co`) and is linked in `app.config.ts`. Do not run `eas init` again: it cannot edit a dynamic `app.config.ts`.

**The variables.** The build reads three public values from the EAS environment named `production`. They never go in the repository: `eas.json` has no `EXPO_PUBLIC_*` value. **Today they are the QA values** (temporary decision, see [State](#state-on-16-november-2026)). Create each variable without `--value`, so the CLI asks for it and the value stays out of your shell history and of this repository (if your `eas-cli` rejects the missing value, pass it with `--value` from your own terminal only):

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_POWERSYNC_URL --environment production --visibility plaintext
```

- `plaintext` is the right visibility: everything with the `EXPO_PUBLIC_` prefix is inlined into the app and readable by anyone who installs it. The Supabase anon key is public by design; row-level security protects the data. Never put a service-role key or any other secret in an `EXPO_PUBLIC_*` variable.
- Use the anon key issued **after** step 1.
- Check them with `eas env:list --environment production`. If your `eas-cli` no longer has `env:create`, the equivalent in current Expo docs is `eas env:set` with the same flags ([Expo: environment variables](https://docs.expo.dev/eas/environment-variables/)).
- **When PROD exists:** update the three values (`eas env:update`) and ship a new build. Nothing else changes in this guide.

### 3. Link in `app.config.ts`

**Who:** already done (#1160). `app.config.ts` declares `owner: 'fatherapps-teams-co'` and `extra.eas.projectId`, for the normal and the `preview` variant (same project).

Build from a commit that has both (step 6).

### 4. Sign-in settings on the backend

**Who:** Mario, on Dokploy (the Supabase stack, not versioned in this repository) and on the Google Cloud project.

The app signs in through the system browser: `supabase.auth.signInWithOAuth` with `skipBrowserRedirect` and `WebBrowser.openAuthSessionAsync`, returning to `swimcro://auth-callback` (`src/core/session/SessionProvider.tsx`). 

1. **Redirect URL.** In the Supabase stack's environment in Dokploy, add `swimcro://auth-callback` to `ADDITIONAL_REDIRECT_URLS` of the auth service (GoTrue) of the **QA** deployment, and redeploy that service. Without it GoTrue falls back to `SITE_URL` and the browser ends on that page instead of returning to the app. `trailskill://auth-callback` stays for builds from before the rename; `swimcro-preview://auth-callback` is for the preview APK ([Test builds](#test-builds-debug-signed-apk)). Note: `ADDITIONAL_REDIRECT_URLS` is a single comma-separated value; keep the entries already there.
2. **Google.** GoTrue talks to Google with a **web** OAuth client (client ID and secret in the auth service, authorized redirect URI `<API_EXTERNAL_URL>/auth/v1/callback`). Check that it exists and works: sign in with Google on the preview APK before building. **PENDIENTE (Mario): confirm.** If the OAuth consent screen in Google Cloud is in **Testing**, only the accounts listed as test users can sign in: add every tester's Google account there, or publish the consent screen (the app asks for the basic email and profile scopes only). **PENDIENTE (Mario): which of the two.**
3. **Email code (second path).** Auth sends it through Resend, confirmed by Mario and the maintainer on 2026-11-15; this repository cannot show it. **Before inviting testers, Mario requests a code in the preview APK with a real address of his own and checks that the email arrives** (look in spam too). If it does not arrive, remove the email option from the tester message and tell testers to use Google only.

### 5. Create the app in Play Console

**Who:** Mario, in Play Console.

1. **Create app**. Name: Swimcro. Default language: Spanish. Type: App, Free.
2. Package name: `com.fatherapps.swimcro`. It cannot change after the first upload (see [One-time setup](#one-time-setup-maintainer)).
3. Accept **Play App Signing** (the default for new apps). Google keeps the app signing key; EAS generates and keeps the upload key in its credentials.
4. You do **not** need to finish the store listing, Data safety, privacy policy, content rating, or target audience to release on Internal testing. Fill them before the closed test, using the drafts as the starting point: [`play-listing.es.md`](release/play-listing.es.md), [`data-safety.md`](release/data-safety.md), and, once published at a public URL after the legal review of #106, [`privacy-policy.es.md`](release/privacy-policy.es.md).

### 6. Build the AAB

**Who:** Mario, in his own terminal.

Run it from a clean checkout of `main` at a commit that has the link of step 3, with the EAS variables in place:

```bash
eas build --profile production --platform android
```

- The first run asks to generate an upload keystore: accept, and let EAS keep it. Never download or commit it.
- `autoIncrement` raises the `versionCode` by itself ([Versioning](#versioning)).
- **Target API level.** The bundle must target Android 16 (API level 36) or higher; Play rejects it otherwise. Before uploading, confirm the value that the installed React Native version sets (`rg -n targetSdk node_modules/react-native/gradle/libs.versions.toml` after `npm ci`) and re-check the [official requirement](https://developer.android.com/google/play/requirements/target-sdk) for the date of the upload. Never lower `targetSdkVersion`.
- The Play build talks to QA, which holds demo accounts and seed data. This is an accepted exception to the "no test accounts or seed data" line of the [Release checklist](#release-checklist), only while the track is Internal testing and the production environment holds QA values.

### 7. Upload to Internal testing

**Who:** Mario, in Play Console.

1. Download the `.aab` from the EAS build page.
2. **Testing → Internal testing → Create new release** → upload the `.aab`. Add a release name (for example the `expo.version`) and short release notes (the draft is in [`play-listing.es.md`](release/play-listing.es.md)).
3. Review and roll out. Internal testing releases are available to testers within minutes, with no Google review of the app content.
4. Tag the built commit `vX.Y.Z` ([Versioning](#versioning)).

A manual upload keeps the first release free of service-account credentials. Later releases are submitted by the release workflow ([Standard release from `main`](#standard-release-from-main)).

### 8. Testers and opt-in link

**Who:** Mario, in Play Console; each tester on their own phone.

1. **Testing → Internal testing → Testers → Create email list** (for example "Internal team") and add each tester's Google account email. Use the same account that will sign in to Swimcro with Google. Emails go only in Play Console, never in this repository.
2. In step 4 add the same accounts as test users in Google Cloud if the consent screen is in Testing.
3. Copy the **opt-in link** from the same page. Play shows it once the release is published. Send it with the message in [`docs/release/tester-message.es.md`](release/tester-message.es.md).
4. **What each tester does:** opens the link on their phone **signed in with the listed Google account**, accepts, installs Swimcro from the Play Store page that follows, opens it, and signs in with Google, or asks for the code that arrives by email (the second path, once Mario's test of step 4 passed).
5. A tester who sees "item not found" used another Google account or skipped the opt-in: ask them to open the link again with the listed account. The Play app can take a few minutes to show a new internal release.

### 9. Smoke test

**Who:** Mario, on a device installed from the Internal testing track.

Run the smoke test of the [Release checklist](#release-checklist). Then confirm that a second Google account from the tester list can sign in, and that the email code arrives for a real address.

## What Play asks, track by track

| Requirement | Internal testing (today) | Closed testing (pilot) |
| --- | --- | --- |
| App created, bundle uploaded, tester list | Yes | Yes |
| Target API level 36 or higher | Yes, the upload is rejected otherwise | Yes |
| Store listing, icon, graphics, screenshots | No | Yes |
| Privacy policy URL (needs the legal review of #106) | No | Yes |
| Data safety form ([`data-safety.md`](release/data-safety.md)) | No: apps only on internal tracks are exempt | Yes, accurate to the build |
| Content rating questionnaire | No | Yes |
| Target audience and Families Policy answer | No | Yes: decide with #107 |
| App access (credentials for reviewers) | No | Yes, see below |
| Data deletion path (in the app and on the web) | No | Yes: decide between a request by email and building it |
| At least 12 testers opted in for 14 consecutive days | No | This is what the track is for: the account is personal, so production needs it |
| Google review of the app | No | Yes |

### Access for Play reviewers (closed test and later)

Play may ask for sign-in credentials in **App content → App access** (the app asks for a sign-in on first launch). Reviewers cannot read a stranger's email, so the emailed code is not enough for them. Decided by the maintainer (issue #910):

- **Use a dedicated Google account** (Google sign-in is enabled in production and does not depend on #84). Create it for the review only, with no 2-step verification that needs a phone, and use only synthetic data in the athletes it manages. Mario creates and keeps it; **its email and password go only in the App access form of Play Console, never in the repository, an issue, or a pull request.** If the consent screen is in Testing, add it as a test user.
- Microsoft sign-in (the sign-in screen has a button for it) is **to be confirmed by Mario**: this guide does not say whether it is enabled in production. Do not use it for the review account until he confirms.
- **Backup:** a dedicated mailbox for the review, whose address and password go in the same form. It works only if the email test of step 4 passed.
- Not allowed: a fixed-code or other authentication shortcut on the server.

Before the closed test, sign in once with the dedicated account on an Internal testing install and check that it reaches the home screen.

### Before the closed test

Closed testing is the track that counts for production access. Before moving there:

- **At least 12 testers opted in for 14 consecutive days** ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)). Keep the 14 days unbroken: a tester who opts out lowers the count.
- Everything marked "Closed testing" in the table above.
- Open decisions settled and closed, because each one changes what the forms must say:
  - **Data deletion.** The app has no way to delete an account or its data. Decide between a request by email (stated in the privacy policy) and building it.
  - **Target audience** and Families Policy applicability (the app stores minors' data while its users are adults; see [Open decisions](#open-decisions)).
  - **Legal review** of the authorization texts and the privacy policy (issue #106).
  - **Backend.** The closed test must not run against QA data by accident: decide with the planner whether the pilot build points to PROD, and rebuild if so.

## Test builds (debug-signed APK)

An installable APK for walking through the app against the test backend, without Google Play or EAS. It is built locally, signed with the **debug key** that Expo's generated Android project ships, and never uploaded anywhere. It is not a release: never publish it, and never sign a store build this way.

**Preview variant.** Build with `APP_VARIANT=preview` and `app.config.ts` gives the APK its own identity, so it installs next to the development client (and the Play build) instead of replacing it. Without `APP_VARIANT` the configuration is unchanged.

| | Usual | `APP_VARIANT=preview` |
| --- | --- | --- |
| Package | `com.fatherapps.swimcro` | `com.fatherapps.swimcro.preview` |
| Name | Swimcro | Swimcro (prueba) |
| Scheme | `swimcro`, plus `trailskill` for links sent before the rename | `swimcro-preview` |

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
   adb -s <device> shell monkey -p com.fatherapps.swimcro.preview -c android.intent.category.LAUNCHER 1
   ```

   The preview package differs from the development client's, so a plain `install` leaves the client untouched: do not use `-r` and do not uninstall anything. Only if you build without `APP_VARIANT=preview` does the APK share the client's package and debug key, and `-r` then replaces the client (reinstall it with `npx expo run:android` or an EAS `development` build).

5. Smoke test: the app opens with no Metro server running, signs in with a demo account, and shows synced data.

Sign-in by one-time code works in the preview variant as is. To sign in with Google or another OAuth provider, the preview variant needs `swimcro-preview://auth-callback` in `ADDITIONAL_REDIRECT_URLS` of the backend it points to (QA today), next to `swimcro://auth-callback` (and `trailskill://auth-callback`, kept for builds from before the rename). Without it, GoTrue falls back to `SITE_URL` and the browser ends on that page instead of returning to the app. This is a maintainer step on the server, not a change in this repository.

School invitation links do not open the preview variant. A link such as `swimcro://invite/<token>` (or `trailskill://invite/<token>`, sent before the rename) belongs to the usual build and the Play build; the preview app (`com.fatherapps.swimcro.preview`) answers only to `swimcro-preview://`. To test an invitation in the preview variant, open `swimcro-preview://invite/<token>` by hand, for example `adb shell am start -a android.intent.action.VIEW -d "swimcro-preview://invite/<token>"`.

A build without the three variables still opens, but sign-in and sync report a missing configuration. Rebuild after changing any `EXPO_PUBLIC_*` value, because they are inlined at build time.

## Release checklist

- [ ] `main` (or `release/X.Y`) is green and the tag points to the built commit.
- [ ] Once PROD exists: PROD was migrated from the tag before the build, and the EAS `production` environment holds the values of the backend the build is meant for.
- [ ] The release pull request of release-please is merged, so `CHANGELOG.md`, the tag and the GitHub Release (with its notes) exist.
- [ ] The release workflow run for the tag finished green on expo.dev **and took the expected route** (`update`, or `build` then `submit`, never `update` after a failed submit), and `app_versions` still holds only versions of store builds.
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
