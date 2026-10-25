import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// Expo inlines EXPO_PUBLIC_* only on direct `process.env.NAME` access.
const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const envAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const missing = [
  ...(envUrl ? [] : ['EXPO_PUBLIC_SUPABASE_URL']),
  ...(envAnonKey ? [] : ['EXPO_PUBLIC_SUPABASE_ANON_KEY']),
];

/** Names the missing environment variables, or null when the client is configured. The app shows it instead of crashing at import. */
export const supabaseConfigError: string | null = missing.length
  ? `Supabase is not configured: missing ${missing.join(' and ')}.`
  : null;
if (supabaseConfigError) console.error(supabaseConfigError);

// Invalid placeholders keep createClient from throwing at import; every request to them fails like being offline.
const url = envUrl || 'https://missing-supabase-url.invalid';
const anonKey = envAnonKey || 'missing-anon-key';

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: secureStorage,
    // SecureStore keys allow only letters, digits, ".", "-" and "_".
    storageKey: 'trailskill-auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
