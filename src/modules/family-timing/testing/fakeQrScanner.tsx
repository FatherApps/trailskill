import { useEffect } from 'react';

import type { QrScanner, QrScannerProps } from '../data/qrScanner';

// Tests only: this folder is never imported by app code, so it stays out of release bundles (same idea as fakeVideoCamera).

/** A scanner the tests drive by hand: scan(text) is a QR the camera read; fail() is the camera failing to open; with `manual`, answer(granted) is the person answering the permission dialog. */
export function createFakeQrScanner(options: { granted?: boolean; manual?: boolean } = {}) {
  const state = { asked: 0, answer: null as ((granted: boolean) => void) | null, mounted: false, onScan: null as QrScannerProps['onScan'] | null, onError: null as QrScannerProps['onError'] | null };
  function FakeScanner({ onScan, onError }: QrScannerProps) {
    state.onScan = onScan;
    state.onError = onError;
    useEffect(() => {
      state.mounted = true;
      return () => {
        state.mounted = false;
      };
    }, []);
    return null;
  }
  const scanner: QrScanner = {
    async requestPermission() {
      state.asked += 1;
      // manual: the person has not answered the system's dialog yet; answer(granted) does.
      if (options.manual) return new Promise<boolean>((resolve) => (state.answer = resolve));
      return options.granted ?? true;
    },
    Scanner: FakeScanner,
  };
  return { scanner, state, scan: (data: string) => state.onScan?.(data), fail: () => state.onError?.() };
}
