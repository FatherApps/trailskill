# Local development

There are two ways to run TrailSkill on your machine. Both use the Android development build; only the backend changes.

| Mode | Backend | Use it for | You need |
| --- | --- | --- | --- |
| [Local app, cloud backend](#local-app-cloud-backend) | The shared test backend | App and interface work against the demo data | The anon key and the Mailpit credentials, from the maintainer |
| [Everything local](#everything-local) | Docker on your machine | Migrations, access policies, sync rules, or anything that could disturb other people | Docker and the Supabase CLI |

## Start from the latest version

Several programmers work at the same time, so always start from the latest `main`. It is the only long-lived branch; there is no `develop`.

For a new issue, create a worktree from the remote `main`, not from your local copy:

```bash
git fetch origin
git worktree add ../trailskill-worktrees/<n>-<slug> -b <type>/<n>-<slug> origin/main
cd ../trailskill-worktrees/<n>-<slug>
npm ci
```

To bring a branch up to date, merge. Do not rebase a branch you already pushed, because force-pushing is not allowed:

```bash
git fetch origin
git merge origin/main
npm ci
```

After updating:

- If a native dependency or config plugin changed, repeat the development build (step 3 of the next section).
- In **Everything local**, apply new migrations by running the `docker compose ... up` command of step 2 again.

The test backend is shared. Do not delete or rewrite data other people may be using. A migration reaches it only when its pull request is merged into `main`, so try it in **Everything local** first.

## Prepare the app

Do this once for either mode. Details are in [Running the app](../CONTRIBUTING.md#running-the-app).

1. Set `JAVA_HOME` to Android Studio's JDK.
2. Start the emulator: `emulator -avd Medium_Phone_API_37.0`.
3. Build and install the development build: `npx expo run:android --no-bundler`. Repeat it only when a native dependency or config plugin changes.

## Local app, cloud backend

1. Ask the maintainer for a `.env` in the root of your checkout, with the variables of `.env.example`. It is ignored by Git, so a new worktree needs its own copy. The URLs are public; the anon key comes only from the maintainer:

   ```text
   EXPO_PUBLIC_SUPABASE_URL=https://trailskill-api.tuls.app
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<from the maintainer>
   EXPO_PUBLIC_POWERSYNC_URL=https://trailskill-sync.tuls.app
   ```

2. Start Metro: `npx expo start --dev-client --clear`, then press `a`. The variables are copied into the bundle, so use `--clear` after any change to `.env`. A change to `.env` does not need a new development build.
3. Sign in with `demo-guardian@example.test`, `demo-coach@example.test`, or `demo-admin@example.test`. There is no password. Request the code once and read it at `https://trailskill-mail.tuls.app`, using the credentials from the maintainer.

## Everything local

These tools run in Docker:

| Tool | Started by | Address on your machine |
| --- | --- | --- |
| Supabase API (auth, data, storage) | `supabase start` | `http://127.0.0.1:54321` |
| Postgres | `supabase start` | `127.0.0.1:54322`, user and password `postgres` |
| Supabase Studio | `supabase start` | `http://127.0.0.1:54323` |
| Mailpit (sign-in emails) | `supabase start` | `http://127.0.0.1:54324` |
| PowerSync | `docker compose` | `http://127.0.0.1:8080` |
| PowerSync storage | `docker compose` | Internal only |

Supabase is not in the Compose file: the Supabase CLI starts it and applies `supabase/migrations` and `supabase/seed.sql`. `deploy/compose.yaml` is the file Dokploy deploys; `deploy/compose.local.yaml` adapts it to your machine, and `deploy/local.env` holds values that work only locally.

Install Docker Desktop and the Supabase CLI, start Docker, and run these from the root of your checkout:

1. Start Supabase. The first run downloads the images:

   ```bash
   supabase start
   ```

2. Start PowerSync. This also creates its database role and applies any pending migration:

   ```bash
   docker compose -f deploy/compose.yaml -f deploy/compose.local.yaml --env-file deploy/local.env up -d --build
   curl -i http://127.0.0.1:8080/probes/liveness
   ```

3. Connect the emulator to your machine, then start Metro against the local stack. These variables take priority over any `.env`:

   ```bash
   adb reverse tcp:54321 tcp:54321
   adb reverse tcp:8080 tcp:8080
   eval "$(supabase status -o env 2>/dev/null)"
   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
   EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
   EXPO_PUBLIC_POWERSYNC_URL=http://127.0.0.1:8080 \
   npx expo start --dev-client --clear
   ```

4. Press `a` and sign in with a demo account from above. Read the code in Mailpit at `http://127.0.0.1:54324`; it needs no credentials.

To stop everything and keep the data:

```bash
docker compose -f deploy/compose.yaml -f deploy/compose.local.yaml --env-file deploy/local.env down
supabase stop
```

To start again from clean demo data, remove the PowerSync data too, because it follows the database:

```bash
docker compose -f deploy/compose.yaml -f deploy/compose.local.yaml --env-file deploy/local.env down -v
supabase db reset
docker compose -f deploy/compose.yaml -f deploy/compose.local.yaml --env-file deploy/local.env up -d --build
```

Run one full local stack per machine. The Edge Functions are not covered here; see [Edge Functions](../deploy/README.md#edge-functions-results-import).

## When something fails

The sign-in screen shows one message ("No pudimos enviar el código") for every failure. In the cloud mode, check the `api-gw` logs of the `supabase` compose in Dokploy; in the local mode, run `docker logs supabase_kong_trailskill`.

| What you see | Cause | Fix |
| --- | --- | --- |
| `POST /auth/v1/otp` with `401` | Invalid anon key, often masked with `***` or cut when copied | Get the key again and restart Metro with `--clear` |
| No request in the logs | A variable is missing from the bundle, the device has no network, or `adb reverse` is missing | Check the variables and restart Metro with `--clear` |
| `Cannot find native module` in the app | The development build is older than the JavaScript | Repeat the development build |
| `network ... not found` from `docker compose` | Supabase is not running | Run `supabase start` first |
| `PSYNC_S2101` in the app | PowerSync does not know the key that signed the session | Run `supabase start` first, then repeat the `docker compose ... up` command |
| `adb shell` hangs after the emulator starts | The emulator snapshot did not restore cleanly | Restart it with `emulator -avd Medium_Phone_API_37.0 -no-snapshot` |
