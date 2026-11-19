import type { PickedVideo, VideoSharing } from '../data/videoSharing';

// Tests only: this folder is never imported by app code, so it stays out of release bundles.

/**
 * Share menu and file picker the tests drive by hand: `next` is what the picker returns, `adoptFails` makes the gallery refuse
 * the copy, and `removable` says whether Android lets the app delete the original.
 */
export function createFakeVideoSharing() {
  const state = {
    shared: [] as string[],
    shareFails: false,
    next: null as PickedVideo | null,
    picks: 0,
    adopted: [] as { video: PickedVideo; name: string }[],
    adoptFails: false,
    removable: true,
  };
  const sharing: VideoSharing = {
    async share(assetId) {
      if (state.shareFails) return false;
      state.shared.push(assetId);
      return true;
    },
    async pick() {
      state.picks += 1;
      return state.next;
    },
    async adopt(video, name) {
      if (state.adoptFails) throw new Error('The gallery refused the video');
      state.adopted.push({ video, name });
      return { assetId: `asset-${name}`, originalRemoved: state.removable };
    },
  };
  return { sharing, state };
}
