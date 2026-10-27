import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

// The Back action of a screen: goes back when there is history, otherwise replaces the screen with `fallback` (a deep link has no history).
// The callback stays the same between renders, even when `fallback` is a new object each time; it always uses the latest `fallback`.
// The stability also depends on `useRouter()` returning the same object between renders; the tests mock the router, so none of them checks it.
export function useGoBack(fallback: Href = '/'): () => void {
  const router = useRouter();
  const fallbackRef = useRef(fallback);
  // shortcut: the ref updates in an effect, so a `goBack` called before the effects of the render that changed `fallback` runs uses the previous one.
  // React flushes pending effects before a discrete event such as a tap, so a button always sees the new one; improve it if `goBack` is ever called from a render or a layout effect.
  useEffect(() => {
    fallbackRef.current = fallback;
  }, [fallback]);
  return useCallback(() => (router.canGoBack() ? router.back() : router.replace(fallbackRef.current)), [router]);
}
