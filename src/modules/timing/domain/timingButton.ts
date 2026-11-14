// What a press of a timing button does (issue #77). Pure: the native module only reports which key was pressed and when.
// Android key codes of the buttons the research confirmed (docs/research/external-button.md, section 2.2).
export const KEY_VOLUME_UP = 24;
export const KEY_VOLUME_DOWN = 25;

export type ButtonPress = { readonly keyCode: number; readonly at: bigint };

export type ButtonConfig = {
  /** Starts, and then stops, the stopwatch. */
  readonly startKey: number;
  /** Marks a split while the stopwatch runs. The same key as startKey means there is no split key. */
  readonly splitKey: number;
  /** After the start, presses of the start key are ignored this long, so a double tap never ends a race at 0.4 s. */
  readonly lockoutNanos: bigint;
};

export const defaultButtonConfig: ButtonConfig = { startKey: KEY_VOLUME_UP, splitKey: KEY_VOLUME_DOWN, lockoutNanos: 3_000_000_000n };

/** One physical press can arrive twice: a second press of the same key this soon is the same press. */
export const DEBOUNCE_NANOS = 250_000_000n;

export const LOCKOUT_SECONDS = [0, 1, 2, 3, 5, 10] as const;

export const nanosFromSeconds = (seconds: number): bigint => BigInt(Math.round(seconds * 1000)) * 1_000_000n;

/** The last accepted press of each key. */
export type Debounce = Readonly<Record<number, bigint>>;

export function debounce(last: Debounce, press: ButtonPress): { accepted: boolean; last: Debounce } {
  const previous = last[press.keyCode];
  if (previous !== undefined && press.at >= previous && press.at - previous < DEBOUNCE_NANOS) return { accepted: false, last };
  return { accepted: true, last: { ...last, [press.keyCode]: press.at } };
}

export type ButtonAction = 'start' | 'stop' | 'split' | 'arrival';

/** The state of the stopwatch the press acts on: idle, running since `startedAt`, or stopped. */
export type ButtonTarget = { readonly status: 'idle' } | { readonly status: 'running'; readonly startedAt: bigint } | { readonly status: 'stopped' };

export function buttonAction(press: ButtonPress, config: ButtonConfig, target: ButtonTarget): ButtonAction | null {
  if (press.keyCode === config.startKey) {
    if (target.status === 'idle') return 'start';
    if (target.status !== 'running') return null;
    return press.at - target.startedAt < config.lockoutNanos ? null : 'stop';
  }
  if (press.keyCode === config.splitKey) return target.status === 'running' ? 'split' : null;
  return null;
}

/**
 * A series with one shared clock and one arrival button: any timing key is that button. The first press starts the
 * clock; after it, presses are ignored for the lockout, so a double tap at the start is never an arrival at 0.4 s.
 */
export function arrivalButtonAction(press: ButtonPress, config: ButtonConfig, target: ButtonTarget): ButtonAction | null {
  if (press.keyCode !== config.startKey && press.keyCode !== config.splitKey) return null;
  if (target.status === 'idle') return 'start';
  if (target.status !== 'running') return null;
  return press.at - target.startedAt < config.lockoutNanos ? null : 'arrival';
}

/** The keys to take from the system while timing: the volume stays as it is for them. */
export const capturedKeys = (config: ButtonConfig): number[] => [...new Set([config.startKey, config.splitKey])];
