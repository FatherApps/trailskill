import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, View } from 'react-native';

import { t } from '../i18n';
import { authFailureSummary } from './authFailureSummary';
import { connectOptions, countUnsentRecords, db, setSessionUser, supabase, supabaseConfigError, SupabaseConnector } from '../sync';
import { useTheme } from '../theme';
import { Button, ConfirmSheet, StateView } from '../ui';

// The id of the user whose data the local database holds. SecureStore keys allow only letters, digits, ".", "-" and "_".
const LOCAL_OWNER_KEY = 'trailskill-local-owner';

/** `azure` is how Supabase names Microsoft. */
export type AuthProvider = 'google' | 'azure';

// trailskill://auth-callback: the server settings (#84) must allow exactly this URL.
const AUTH_CALLBACK_PATH = 'auth-callback';

type SignOutResult ={ status: 'signed_out' } | { status: 'blocked_pending'; unsent: number; rejected: number };

type SessionValue = {
  /** Null until the local database holds only this user's data, so no screen shows another person's records. */
  session: Session | null;
  /** The local database could not connect to the sync service; records stay on the phone. */
  syncConnectFailed: boolean;
  /** The server settings are missing from the build; no request can succeed. For diagnostics, never for display. */
  configError: string | null;
  requestCode(email: string, options?: { createUser?: boolean }): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  /** Opens the provider in the system browser. 'cancelled' when the person closes it or declines; rejects on a failure. */
  signInWithProvider(provider: AuthProvider): Promise<'signed_in' | 'cancelled'>;
  /** Trades the code of a provider link that reached the app with no sign-in waiting for it. A no-op when one is. */
  resumeProviderSignIn(code: string): Promise<void>;
  signOut(options?: { force?: boolean }): Promise<SignOutResult>;
};

/** The emailed code is wrong or expired; the server reports both the same way. */
export class CodeMismatchError extends Error {
  constructor() {
    super('The code does not match');
    this.name = 'CodeMismatchError';
  }
}

function logFailure(error: unknown) {
  if (__DEV__) console.error('[session] Could not finish the provider sign-in', authFailureSummary(error));
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
  // The user whose owner check failed, and the user whose discard failed: each shows its error until a retry.
  const [checkFailedFor, setCheckFailedFor] = useState<string>();
  // `cleared`: the local data was already cleared when the discard failed, so it must not be described as still there.
  const [discardFailure, setDiscardFailure] = useState<{ userId: string; cleared: boolean }>();
  const { colors, space } = useTheme();
  // The user of the session stored before launch: before owners were recorded, the local data was always theirs.
  const restoredUserId = useRef<string>(undefined);
  // How many provider sign-ins wait for the browser (a second press adds one), the codes traded or being traded,
  // and the code of a link that arrived while one waited.
  const waiting = useRef(0);
  const tradedCodes = useRef(new Set<string>());
  const parkedCode = useRef<string>(undefined);
  // Bumped to run the local data check again after discarding or after a failed check.
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
      // Right away, not after a render: a write in flight checks it as it commits.
      setSessionUser(next?.user.id);
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
        if ((await countUnsentRecords()).unsent > 0) {
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
      if (supabaseConfigError) return;
      await db.connect(connector, connectOptions).catch((error: unknown) => {
        if (__DEV__) console.warn('[sync] Could not connect to the sync service', error);
        if (current) setSyncFailedFor(userId);
      });
    })().catch(() => {
      // SecureStore or the local database failed before the data could be shown: nothing is shown or connected until a retry.
      if (current) setCheckFailedFor(userId);
    });
    return () => {
      current = false;
      // The next check starts from scratch, so an earlier result never shows a screen for this run.
      setReadyFor(undefined);
      setBlockedFor(undefined);
      setCheckFailedFor(undefined);
      setDiscardFailure(undefined);
      // The session ended or changed without signing out: stop syncing, keep the data for its owner.
      connector.cancelWaits();
      db.disconnect().catch(() => {});
    };
  }, [userId, check, connector]);
  const syncConnectFailed = userId !== undefined && syncFailedFor === userId;
  const ready = userId !== undefined && readyFor === userId;
  const previousUserPending = userId !== undefined && blockedFor === userId;
  const checkFailed = userId !== undefined && checkFailedFor === userId;
  const discardFailed = userId !== undefined && discardFailure?.userId === userId;
  // Once the database was cleared, the previous person's records are gone: the sheet only offers to finish or leave.
  const discardCleared = discardFailed && discardFailure.cleared;
  const discardFailedMessage = t(discardCleared ? 'session.discard_incomplete' : 'session.discard_failed');
  const checking = userId !== undefined && !ready && !previousUserPending && !checkFailed;

  const retryCheck = useCallback(() => setCheck((value) => value + 1), []);

  const discardPreviousUserData = useCallback(async () => {
    if (!userId) return;
    let cleared = false;
    try {
      connector.cancelWaits();
      await db.disconnectAndClear();
      cleared = true;
      await SecureStore.setItemAsync(LOCAL_OWNER_KEY, userId);
    } catch {
      // The sheet stays open with the failure, so the person can try again or go back to the previous person.
      // An earlier attempt may have cleared already: a later failure before clearing does not bring the records back.
      const alreadyCleared = discardFailure?.userId === userId && discardFailure.cleared;
      const nowCleared = cleared || alreadyCleared;
      setDiscardFailure({ userId, cleared: nowCleared });
      AccessibilityInfo.announceForAccessibility(t(nowCleared ? 'session.discard_incomplete' : 'session.discard_failed'));
      return;
    }
    retryCheck();
  }, [userId, connector, retryCheck, discardFailure]);

  // Ends this device's session and keeps the local data for its owner: the safe choice in the previous-person sheet,
  // and the way out of a failed owner check.
  const endSessionKeepingData = useCallback(() => {
    // Offline, supabase-js still drops the stored session; there is nothing else to do with an error here.
    supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }, []);

  const requestCode = useCallback(async (email: string, options?: { createUser?: boolean }) => {
    if (supabaseConfigError) throw new Error(supabaseConfigError);
    // Only registration creates accounts; signing in with a code never does.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: options?.createUser ?? false },
    });
    if (error) throw error;
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (supabaseConfigError) throw new Error(supabaseConfigError);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (!error) return;
    throw error.code === 'otp_expired' ? new CodeMismatchError() : error;
  }, []);

  // A code is good for one trade: the sign-in that waits for the browser and the auth-callback route must not both make it.
  const tradeCode = useCallback(async (code: string) => {
    tradedCodes.current.add(code);
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } catch (error) {
      // A failed trade can be tried again with the same code; only a trade that worked is final.
      tradedCodes.current.delete(code);
      throw error;
    }
  }, []);

  const signInWithProvider = useCallback(async (provider: AuthProvider): Promise<'signed_in' | 'cancelled'> => {
    if (supabaseConfigError) throw new Error(supabaseConfigError);
    waiting.current += 1;
    try {
      const redirectTo = Linking.createURL(AUTH_CALLBACK_PATH);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        // The browser is opened here, not by supabase-js, so its result comes back to this call.
        options: { redirectTo, skipBrowserRedirect: true, ...(provider === 'azure' ? { scopes: 'email' } : {}) },
      });
      if (error) throw error;
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return 'cancelled';
      const { queryParams } = Linking.parse(result.url);
      if (queryParams?.error === 'access_denied') return 'cancelled';
      if (queryParams?.error) throw new Error(String(queryParams.error_description ?? queryParams.error));
      const code = queryParams?.code;
      if (typeof code !== 'string' || !code) throw new Error('The provider did not return a code');
      // This sign-in trades it, so the same code parked by the route is not tried a second time.
      if (parkedCode.current === code) parkedCode.current = undefined;
      await tradeCode(code);
      // The auth listener delivers the session: from here on it is the same path as the emailed code.
      return 'signed_in';
    } finally {
      waiting.current -= 1;
      // The last sign-in to end trades a code that arrived while it waited and that it never saw.
      const parked = parkedCode.current;
      if (waiting.current === 0 && parked !== undefined) {
        parkedCode.current = undefined;
        if (!tradedCodes.current.has(parked)) tradeCode(parked).catch(logFailure);
      }
    }
  }, [tradeCode]);

  // Android can close the app while the browser is open: the link then starts it on its own and no sign-in is waiting.
  // The PKCE verifier is in the session storage, so the code still trades. While a sign-in waits, the code is parked:
  // that sign-in trades it itself, or hands it back here if the browser ended without it (dismissed after the link).
  const resumeProviderSignIn = useCallback(async (code: string) => {
    if (supabaseConfigError) throw new Error(supabaseConfigError);
    if (tradedCodes.current.has(code)) return;
    if (waiting.current > 0) {
      parkedCode.current = code;
      return;
    }
    await tradeCode(code);
  }, [tradeCode]);

  const signOut = useCallback(async (options?: { force?: boolean }): Promise<SignOutResult> => {
    // Awaits the real count: the sync hook reports 0 until its first query lands.
    const { unsent, rejected } = await countUnsentRecords();
    if (signOutDecision(unsent, options?.force ?? false) === 'blocked_pending') {
      return { status: 'blocked_pending', unsent, rejected };
    }
    // Clear first, so the next person on a shared phone starts with an empty local database.
    connector.cancelWaits();
    await db.disconnectAndClear();
    // 'local' ends only this device's session. Offline, supabase-js still drops the stored session and returns an error:
    // only a session that is still stored means the sign-out failed.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error && (await supabase.auth.getSession()).data.session) throw error;
    return { status: 'signed_out' };
  }, [connector]);

  const visibleSession = ready ? session : null;
  const value = useMemo(
    () => ({ session: visibleSession, syncConnectFailed, configError: supabaseConfigError, requestCode, verifyCode, signInWithProvider, resumeProviderSignIn, signOut }),
    [visibleSession, syncConnectFailed, requestCode, verifyCode, signInWithProvider, resumeProviderSignIn, signOut],
  );

  // Render nothing until the stored session and the owner of the local data are known,
  // so a signed-in person never sees the sign-in screen flash.
  if (!restored || checking) return null;
  if (checkFailed) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: space[4], gap: space[3], backgroundColor: colors['surface-0'] }}>
        <StateView
          kind="error"
          title={t('session.check_failed_title')}
          message={t('session.check_failed_message')}
          action={{ label: t('sync.retry'), onPress: retryCheck }}
        />
        {/* StateView takes one action: the way out sits below it, quieter than the retry. */}
        <Button variant="ghost" label={t('session.sign_out')} onPress={endSessionKeepingData} />
      </View>
    );
  }
  return (
    <SessionContext.Provider value={value}>
      {children}
      <ConfirmSheet
        visible={previousUserPending}
        title={t(discardCleared ? 'session.discard_incomplete_title' : 'session.previous_user_title')}
        message={discardFailed ? discardFailedMessage : t('session.previous_user_message')}
        confirmLabel={t(discardCleared ? 'sync.retry' : 'session.previous_user_discard')}
        cancelLabel={t(discardCleared ? 'session.sign_out' : 'session.previous_user_return')}
        destructive={!discardCleared}
        onConfirm={discardPreviousUserData}
        onCancel={endSessionKeepingData}
      />
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
