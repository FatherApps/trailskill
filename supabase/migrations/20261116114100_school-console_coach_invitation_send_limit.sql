-- Module school-console: limit how often a coach invitation is sent (issue #1141). The function school-console-invite-coach
-- emails the invitation every time it is called, so an admin could resend it without end, to one recipient or to many. Each
-- call that would send claims a send here first, and the claim is refused above a limit per calling admin and above a limit per
-- recipient (the invitation) in a time window. The count is in the database, so it survives restarts of the function, and the
-- advisory locks make counting and recording one critical section per caller and per invitation, like the share code lookups
-- (issue #1027): overlapping requests cannot all see the same count. Not in the powersync publication: only the function reads it.

create table public.coach_invitation_sends (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  sent_by uuid not null references auth.users (id) on delete cascade,
  invitation_id uuid not null references public.coach_invitations (id) on delete cascade
);

create index coach_invitation_sends_sent_by_idx on public.coach_invitation_sends (sent_by, sent_at);
create index coach_invitation_sends_invitation_idx on public.coach_invitation_sends (invitation_id, sent_at);

-- Only the function below touches it: row level security without policies, and no grants.
alter table public.coach_invitation_sends enable row level security;
revoke all on table public.coach_invitation_sends from anon, authenticated;

-- Answers 'claimed' (the send was recorded: the caller may send), 'caller_rate_limited' or 'recipient_rate_limited'.
-- A caller who is not an admin of the invitation's school is refused with 42501, the same rule as the coach_invitations insert policy.
create function public.claim_coach_invitation_send(invitation_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- PROVISIONAL starting values, for the maintainer to confirm (issue #1141): sends per admin and per recipient in the window.
  caller_limit constant integer := 30;
  recipient_limit constant integer := 3;
  send_window constant interval := '24 hours';
  caller uuid := (select auth.uid());
  school uuid;
begin
  if caller is null then
    raise exception 'claiming a send needs a signed-in user' using errcode = '42501';
  end if;

  select i.school_id into school from public.coach_invitations i where i.id = claim_coach_invitation_send.invitation_id;
  if school is null or school not in (select app.admin_school_ids()) then
    raise exception 'the caller does not administer the school of the invitation' using errcode = '42501';
  end if;

  -- One claim at a time per caller and per invitation, always locked in this order so two claims cannot wait on each other.
  perform pg_advisory_xact_lock(hashtextextended(caller::text || ':coach-invitation-sends', 0));
  perform pg_advisory_xact_lock(hashtextextended(claim_coach_invitation_send.invitation_id::text || ':coach-invitation-sends', 0));

  -- Sends older than the window no longer count: dropping them keeps the table small.
  delete from public.coach_invitation_sends s where s.sent_by = caller and s.sent_at < now() - send_window;

  if (select count(*) from public.coach_invitation_sends s where s.sent_by = caller and s.sent_at > now() - send_window) >= caller_limit then
    return 'caller_rate_limited';
  end if;
  -- Per recipient: the sends of anyone to this invitation.
  if (
    select count(*) from public.coach_invitation_sends s
    where s.invitation_id = claim_coach_invitation_send.invitation_id and s.sent_at > now() - send_window
  ) >= recipient_limit then
    return 'recipient_rate_limited';
  end if;

  insert into public.coach_invitation_sends (sent_by, invitation_id) values (caller, claim_coach_invitation_send.invitation_id);
  return 'claimed';
end;
$$;

revoke execute on function public.claim_coach_invitation_send(uuid) from public, anon;
grant execute on function public.claim_coach_invitation_send(uuid) to authenticated;
