import { useEffect, useState } from 'react';

import { supabase } from '../../../core/sync';
import type { RegistrationDraftRepository } from './registrationDraft';

// The tables whose row says an account is already registered: the adult's own profile, a platform admin, a school member
// (coach or admin) and a guardian or adult athlete (managed athletes). Staff and admins have no adult profile.
const EVIDENCE_SOURCES = [
  { table: 'adult_profiles', column: 'user_id' },
  { table: 'platform_admins', column: 'user_id' },
  { table: 'school_memberships', column: 'user_id' },
  { table: 'athlete_managers', column: 'user_id' },
] as const;

export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number]['table'];

export type ProfileEvidenceRepository = {
  /** Whether the server has any row of EVIDENCE_SOURCES for the user. Read only. Throws when it could not be asked (no signal). */
  hasProfile(userId: string): Promise<boolean>;
};

// Row level security lets each user read only their own rows, so "no rows" is a real answer; any error is "unknown", never "no".
export function createSupabaseProfileEvidenceRepository(): ProfileEvidenceRepository {
  return {
    async hasProfile(userId) {
      const answers = await Promise.all(
        EVIDENCE_SOURCES.map(({ table, column }) => supabase.from(table).select(column).eq(column, userId).limit(1)),
      );
      for (const { error } of answers) if (error) throw error;
      return answers.some(({ data }) => (data?.length ?? 0) > 0);
    },
  };
}

export function createInMemoryProfileEvidenceRepository(options: { rows?: { source: EvidenceSource; userId: string }[]; failing?: boolean } = {}) {
  const repository = {
    calls: 0,
    failing: options.failing ?? false,
    async hasProfile(userId: string) {
      repository.calls += 1;
      if (repository.failing) throw new Error('no signal');
      return (options.rows ?? []).some((row) => row.userId === userId);
    },
  };
  return repository;
}

// checking: still deciding. ready: has a profile or a draft, so the app opens as always. register: a session with no profile.
// unreachable: nothing local says it has a profile and the server could not be asked; never the registration and never the app.
export type ProfileGate = { status: 'checking' | 'ready' | 'register' | 'unreachable'; recheck: () => void };

export type ProfileGateInput = {
  userId: string | undefined;
  email: string | undefined;
  drafts: RegistrationDraftRepository;
  // The first sync reached this device: before it the local database is empty for everyone, so it proves nothing.
  localReady: boolean;
  // Rows already on the device (a membership or a managed athlete). Local database only, so it works with no signal.
  hasLocalProfile: (userId: string) => Promise<boolean>;
  evidence: ProfileEvidenceRepository;
};

const same = (a: string | undefined, b: string | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

// Decides whether a signed-in session goes to the app or to the registration steps. The server is asked only when nothing local
// says the account is registered, so someone who already uses the app opens it with no signal. A draft for this email keeps
// today's path (useFinishRegistration finishes it). `recheck` asks again, for the retry and after the registration saved a draft.
export function useProfileGate({ userId, email, drafts, localReady, hasLocalProfile, evidence }: ProfileGateInput): ProfileGate {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ userId: string; attempt: number; status: ProfileGate['status'] }>();

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async (): Promise<ProfileGate['status']> => {
      const draft = await drafts.load().catch(() => null);
      if (draft && same(draft.email, email)) return 'ready';
      if (localReady && (await hasLocalProfile(userId).catch(() => false))) return 'ready';
      try {
        return (await evidence.hasProfile(userId)) ? 'ready' : 'register';
      } catch {
        return 'unreachable';
      }
    })().then((status) => active && setAnswer({ userId, attempt, status }));
    return () => {
      active = false;
    };
  }, [userId, email, drafts, localReady, hasLocalProfile, evidence, attempt]);

  const recheck = () => setAttempt((current) => current + 1);
  const current = answer && answer.userId === userId && answer.attempt === attempt ? answer.status : 'checking';
  return { status: current, recheck };
}
