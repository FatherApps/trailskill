import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

// The Back action of a screen: goes back when there is history, otherwise replaces the screen with `fallback` (a deep link has no history).
// The callback stays the same between renders while `fallback` does not change.
export function useGoBack(fallback: Href = '/'): () => void {
  const router = useRouter();
  return useCallback(() => (router.canGoBack() ? router.back() : router.replace(fallback)), [router, fallback]);
}
