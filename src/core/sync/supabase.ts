import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// Expo inlines EXPO_PUBLIC_* only on direct `process.env.NAME` access.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

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
