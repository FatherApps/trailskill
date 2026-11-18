-- The minimum version gate (issue #1189): per platform, the oldest app version that may still run and the newest one
-- published. The app reads it before sign-in, so anonymous callers read it too; only the service role writes it.
create table public.app_versions (
  platform text primary key check (platform in ('android', 'ios')),
  min_version text not null check (min_version ~ '^[0-9]{1,9}(\.[0-9]{1,9})*$'),
  latest_version text not null check (latest_version ~ '^[0-9]{1,9}(\.[0-9]{1,9})*$'),
  updated_at timestamptz not null default now(),
  -- Compared as numbers part by part, so 0.10.0 is newer than 0.9.0; malformed values are left to the format checks.
  constraint app_versions_version_order check (
    case when min_version ~ '^[0-9]{1,9}(\.[0-9]{1,9})*$' and latest_version ~ '^[0-9]{1,9}(\.[0-9]{1,9})*$'
      then string_to_array(min_version, '.')::int[] <= string_to_array(latest_version, '.')::int[]
      else true end
  )
);

alter table public.app_versions enable row level security;

-- The default privileges grant every new table to anon and authenticated: here they only read.
revoke all on table public.app_versions from anon, authenticated;
grant select on table public.app_versions to anon, authenticated;

create policy app_versions_read on public.app_versions for select to anon, authenticated using (true);
