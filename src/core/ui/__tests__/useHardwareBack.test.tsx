import { renderHook } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import { useHardwareBack } from '../useHardwareBack';

type Listener = () => boolean | null | undefined;

// The jest environment has no hardware back: capture what the hook registers and press it by hand.
let add: jest.SpyInstance;
let remove: jest.Mock;
beforeEach(() => {
  remove = jest.fn();
  add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove }));
});
afterEach(() => jest.restoreAllMocks());

describe('useHardwareBack', () => {
  it('subscribes to hardwareBackPress; pressing it calls onBack and reports it handled', async () => {
    const onBack = jest.fn();
    await renderHook(() => useHardwareBack(onBack));

    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][0]).toBe('hardwareBackPress');
    expect((add.mock.calls[0][1] as Listener)()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe without onBack', async () => {
    await renderHook(() => useHardwareBack(undefined));

    expect(add).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = await renderHook(() => useHardwareBack(jest.fn()));
    expect(remove).not.toHaveBeenCalled();

    await unmount();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes when onBack goes from a function to undefined, and subscribes again when it returns', async () => {
    const onBack = jest.fn();
    const { rerender } = await renderHook(({ cb }: { cb: (() => void) | undefined }) => useHardwareBack(cb), {
      initialProps: { cb: onBack as (() => void) | undefined },
    });

    await rerender({ cb: undefined });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);

    await rerender({ cb: onBack });
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('keeps one subscription when onBack changes to another function, and pressing runs the new one', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = await renderHook(({ cb }: { cb: () => void }) => useHardwareBack(cb), { initialProps: { cb: first } });

    await rerender({ cb: second });

    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    (add.mock.calls[0][1] as Listener)();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('keeps the parent below the child when the parent re-renders with an inline callback', async () => {
    // BackHandler runs the most recent subscription first and stops at the first one that returns true.
    const stack: Listener[] = [];
    add.mockImplementation((_event: string, listener: Listener) => {
      stack.push(listener);
      return { remove: () => stack.splice(stack.indexOf(listener), 1) };
    });
    const press = () => [...stack].reverse().some((listener) => listener());
    const parent = jest.fn();
    const child = jest.fn();
    const { rerender } = await renderHook(({ cb }: { cb: () => void }) => useHardwareBack(cb), { initialProps: { cb: () => parent() } });
    await renderHook(() => useHardwareBack(child));

    await rerender({ cb: () => parent() });
    press();

    expect(child).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
  });
});
