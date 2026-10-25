import type { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { t } from '../i18n';
import { countUnsentRecords, db, supabase, supabaseConfigError, SupabaseConnector } from '../sync';
import { ConfirmSheet } from '../ui';

// The id of the user whose data the local database holds. SecureStore keys allow only letters, digits, ".", "-" and "_".
const LOCAL_OWNER_KEY = 'trailskill-local-owner';

type SignOutResult = 'signed_out' | 'blocked_pending';

type SessionValue = {
  /** Null until the local database holds only this user's data, so no screen shows another person's records. */
  session: Session | null;
  /** The local database could not connect to the sync service; records stay on the phone. */
  syncConnectFailed: boolean;
  /** The server settings are missing from the build; no request can succeed. For diagnostics, never for display. */
  configError: string | null;
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
  // The user whose local data may be shown, and the user blocked by another person's unsent records.
  const [readyFor, setReadyFor] = useState<string>();
  const [blockedFor, setBlockedFor] = useState<string>();
  // The user of the session stored before launch: before owners were recorded, the local data was always theirs.
  const restoredUserId = useRef<string>(undefined);
  // Bumped to run the local data check again after discarding.
  const [check, setCheck] = useState(0);
  // One connector, so cancelWaits() reaches the upload wait in progress.
  const [connector] = useState(
    // Expo inlines EXPO_PUBLIC_* only on direct `process.env.NAME` access.
    () => new SupabaseConnector(supabase, process.env.EXPO_PUBLIC_POWERSYNC_URL ?? ''),
  );

  useEffect(() => {
    // INITIAL_SESSION delivers the stored session, so there is no separate restore call.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'INITIAL_SESSION') restoredUserId.current = next?.user.id;
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
    (async () => {
      // PowerSync never connects for a user other than the owner of the local data: another owner's data is cleared first.
      const owner = await SecureStore.getItemAsync(LOCAL_OWNER_KEY);
      if (owner === null && userId === restoredUserId.current) {
        // Data stored before owners were recorded belongs to the session that was already signed in.
        await SecureStore.setItemAsync(LOCAL_OWNER_KEY, userId);
      } else if (owner !== userId) {
        // Any other unknown owner (first run, or a new sign-in over old data) counts as another person.
        if ((await countUnsentRecords()) > 0) {
          if (current) setBlockedFor(userId);
          return;
        }
        connector.cancelWaits();
        await db.disconnectAndClear();
        await SecureStore.setItemAsync(LOCAL_OWNER_KEY, userId);
      }
      // Ignore a result that arrives after the user changed.
      if (!current) return;
      setReadyFor(userId);
      if (!supabaseConfigError) await db.connect(connector);
    })().catch(() => {
      // shortcut: a failed owner check keeps the person on sign-in with no message; show one if it is ever seen on a device.
      if (current) setSyncFailedFor(userId);
    });
    return () => {
      current = false;
      // The next check starts from scratch, so an earlier result never shows a screen for this run.
      setReadyFor(undefined);
      setBlockedFor(undefined);
      // The session ended or changed without signing out: stop syncing, keep the data for its owner.
      connector.cancelWaits();
      db.disconnect().catch(() => {});
    };
  }, [userId, check, connector]);
  const syncConnectFailed = userId !== undefined && syncFailedFor === userId;
  const ready = userId !== undefined && readyFor === userId;
  const previousUserPending = userId !== undefined && blockedFor === userId;
  const checking = userId !== undefined && !ready && !previousUserPending && !syncConnectFailed;

  const discardPreviousUserData = useCallback(async () => {
    if (!userId) return;
    connector.cancelWaits();
    await db.disconnectAndClear();
    await SecureStore.setItemAsync(LOCAL_OWNER_KEY, userId);
    setCheck((value) => value + 1);
  }, [userId, connector]);

  // The safe choice: the new session ends, the previous person's records stay on the phone until they sign in again.
  const returnToPreviousUser = useCallback(() => {
    // Offline, supabase-js still drops the stored session; there is nothing else to do with an error here.
    supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }, []);

  const requestCode = useCallback(async (email: string) => {
    if (supabaseConfigError) throw new Error(supabaseConfigError);
    // Accounts are created by registration, never by asking for a code.
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) throw error;
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (supabaseConfigError) throw new Error(supabaseConfigError);
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
    connector.cancelWaits();
    await db.disconnectAndClear();
    // 'local' ends only this device's session. Offline, supabase-js still drops the stored session and returns an error:
    // only a session that is still stored means the sign-out failed.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error && (await supabase.auth.getSession()).data.session) throw error;
    return 'signed_out';
  }, [connector]);

  const visibleSession = ready ? session : null;
  const value = useMemo(
    () => ({ session: visibleSession, syncConnectFailed, configError: supabaseConfigError, requestCode, verifyCode, signOut }),
    [visibleSession, syncConnectFailed, requestCode, verifyCode, signOut],
  );

  // Render nothing until the stored session and the owner of the local data are known,
  // so a signed-in person never sees the sign-in screen flash.
  if (!restored || checking) return null;
  return (
    <SessionContext.Provider value={value}>
      {children}
      <ConfirmSheet
        visible={previousUserPending}
        title={t('session.previous_user_title')}
        message={t('session.previous_user_message')}
        confirmLabel={t('session.previous_user_discard')}
        cancelLabel={t('session.previous_user_return')}
        destructive
        // On a failure the sheet stays open, so the person can try again.
        onConfirm={() => discardPreviousUserData().catch(() => {})}
        onCancel={returnToPreviousUser}
      />
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
