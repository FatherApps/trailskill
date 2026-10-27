import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

// The Back action of a screen: goes back when there is history, otherwise replaces the screen with `fallback` (a deep link has no history).
// The callback stays the same between renders, even when `fallback` is a new object each time; it always uses the latest `fallback`.
export function useGoBack(fallback: Href = '/'): () => void {
  const router = useRouter();
  const fallbackRef = useRef(fallback);
  useEffect(() => {
    fallbackRef.current = fallback;
  }, [fallback]);
  return useCallback(() => (router.canGoBack() ? router.back() : router.replace(fallbackRef.current)), [router]);
}
