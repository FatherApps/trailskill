import { requireOptionalNativeModule } from 'expo-modules-core';
import { Asset } from 'expo-media-library';
import { forwardRef, useImperativeHandle, type ComponentType, type RefAttributes } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

// The port to the videos already in the phone's gallery (#1089): whether a time's video is still there, and a simple player.
// The adapter below wraps expo-media-library and expo-video; the tests use the fake in testing/.

export type VideoPlayerHandle = {
  /** Moves the video to this point, in milliseconds from its start, and plays it. */
  seekTo(millis: number): void;
};

export type VideoPlayerProps = { uri: string; style?: StyleProp<ViewStyle> };

export type VideoLibrary = {
  /** The video's address to play it from, or null when it was deleted from the gallery or cannot be read. */
  uriOf(assetId: string): Promise<string | null>;
  /** The video with the phone's own play, pause and seek controls. */
  Player: ComponentType<VideoPlayerProps & RefAttributes<VideoPlayerHandle>>;
};

function nativePlayer(): VideoLibrary['Player'] {
  // Loaded only where the native module exists, so tests and builds without it never touch it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useVideoPlayer, VideoView } = require('expo-video') as typeof import('expo-video');
  return forwardRef<VideoPlayerHandle, VideoPlayerProps>(function GalleryVideoPlayer({ uri, style }, ref) {
    const player = useVideoPlayer(uri, (p) => {
      p.loop = false;
      p.play();
    });
    useImperativeHandle(
      ref,
      () => ({
        seekTo(millis) {
          player.currentTime = Math.max(0, millis) / 1000;
          player.play();
        },
      }),
      [player],
    );
    return <VideoView player={player} nativeControls contentFit="contain" style={style} />;
  });
}

function nativeVideoLibrary(): VideoLibrary {
  return {
    async uriOf(assetId) {
      // The id is the video's content URI in the gallery. The app made the video, so it can read it back without a read
      // permission (none is declared, #1169); a deleted video no longer resolves and is reported as missing.
      try {
        return (await new Asset(assetId).getUri()) ? assetId : null;
      } catch {
        return null;
      }
    },
    Player: nativePlayer(),
  };
}

/** The gallery videos and their player; null where expo-video is missing (tests, an old build). */
export const videoLibrary: VideoLibrary | null = requireOptionalNativeModule('ExpoVideo') ? nativeVideoLibrary() : null;
