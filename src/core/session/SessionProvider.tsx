import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { countUnsentRecords, db, supabase, SupabaseConnector } from '../sync';

type SignOutResult = 'signed_out' | 'blocked_pending';

type SessionValue = {
  session: Session | null;
  /** The local database could not connect to the sync service; records stay on the phone. */
  syncConnectFailed: boolean;
  requestCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  signOut(options?: { force?: boolean }): Promise<SignOutResult>;
};

/** The emailed code is wrong or expired; the server reports both the same way. */
export class CodeMismatchError extends Error {
  constructor() {
    super('The code does not match');
    this.name = 'CodeMismatchError';
  }
}

export function signOutDecision(pendingCount: number, force: boolean): 'proceed' | 'blocked_pending' {
  return pendingCount > 0 && !force ? 'blocked_pending' : 'proceed';
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [restored, setRestored] = useState(false);
  // Keyed on the user, so a failure never carries over to the next person.
  const [syncFailedFor, setSyncFailedFor] = useState<string>();

  useEffect(() => {
    // INITIAL_SESSION delivers the stored session, so there is no separate restore call.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setRestored(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Keyed on the user, not the session object: token refreshes must not reconnect.
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let current = true;
    // Expo inlines EXPO_PUBLIC_* only on direct `process.env.NAME` access.
    db.connect(new SupabaseConnector(supabase, process.env.EXPO_PUBLIC_POWERSYNC_URL ?? '')).catch(() => {
      // Ignore a result that arrives after the user changed.
      if (current) setSyncFailedFor(userId);
    });
    return () => {
      current = false;
    };
  }, [userId]);
  const syncConnectFailed = userId !== undefined && syncFailedFor === userId;

  const requestCode = useCallback(async (email: string) => {
    // Accounts are created by registration, never by asking for a code.
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) throw error;
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (!error) return;
    throw error.code === 'otp_expired' ? new CodeMismatchError() : error;
  }, []);

  const signOut = useCallback(async (options?: { force?: boolean }): Promise<SignOutResult> => {
    // Awaits the real count: the sync hook reports 0 until its first query lands.
    if (signOutDecision(await countUnsentRecords(), options?.force ?? false) === 'blocked_pending') {
      return 'blocked_pending';
    }
    // Clear first, so the next person on a shared phone starts with an empty local database.
    await db.disconnectAndClear();
    // 'local' ends only this device's session. Offline, supabase-js still drops the stored session and returns an error:
    // only a session that is still stored means the sign-out failed.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error && (await supabase.auth.getSession()).data.session) throw error;
    return 'signed_out';
  }, []);

  const value = useMemo(
    () => ({ session, syncConnectFailed, requestCode, verifyCode, signOut }),
    [session, syncConnectFailed, requestCode, verifyCode, signOut],
  );

  // Render nothing until the stored session is known, so a signed-in person never sees the sign-in screen flash.
  if (!restored) return null;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
