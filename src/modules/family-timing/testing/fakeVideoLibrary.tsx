import { forwardRef, useImperativeHandle } from 'react';

import type { VideoLibrary, VideoPlayerHandle, VideoPlayerProps } from '../data/videoLibrary';

// Tests only: this folder is never imported by app code, so it stays out of release bundles.

/** A gallery the tests fill by hand: `videos` maps an asset id to its uri; a missing id is a deleted video. */
export function createFakeVideoLibrary(videos: Record<string, string> = {}) {
  const state = { videos: { ...videos }, opened: [] as string[], seeks: [] as number[] };
  const FakePlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function FakePlayer({ uri }, ref) {
    state.opened.push(uri);
    useImperativeHandle(ref, () => ({ seekTo: (millis) => state.seeks.push(millis) }), []);
    return null;
  });
  const library: VideoLibrary = {
    async uriOf(assetId) {
      return state.videos[assetId] ?? null;
    },
    Player: FakePlayer,
  };
  return { library, state };
}
