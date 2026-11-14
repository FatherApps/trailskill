# timing-button (Expo local module, Android only)

Captures the timing buttons (issue #77): the inline buttons of a USB headset such as the Mpow PA071A, or the phone's own volume keys, with a native timestamp. Research and protocol: `docs/research/external-button.md`.

Only the key capture and the clock are native. Which key does what, debounce and the start lockout are TypeScript in `src/modules/timing/domain/timingButton.ts`, tested with a fake adapter. The JavaScript side is `src/modules/timing/data/timingButton.ts`.

- `now()`: `SystemClock.elapsedRealtimeNanos()` as a decimal string. Every mark of a flow that uses the buttons comes from this clock, screen touches included, so key presses and touches share one time base.
- `capture(keyCodes)`: from now on, presses of these keys are consumed (the volume does not change) and reported as `onKey`. Only while the app is in the foreground.
- `learn()`: the next press of any key (except back, home, power and app switch) is consumed and reported, to choose a key in Ajustes.
- `stop()`: keys go back to the system.
- `keyboards()`: connected external key devices (`isExternal`, API 29+), and `onDevicesChanged` when one is added or removed.

Events: `onKey { keyCode, at, external, device }`, where `at` is the clock read when the activity received the key, in the base of `now()`.

The keys reach the module through an Expo `ReactActivityHandler` (`TimingButtonPackage`), so `MainActivity` needs no change and no config plugin.

iOS does not give apps volume key events; an iOS button needs a Bluetooth keyboard-key device and its own adapter (research, section 3.2).
