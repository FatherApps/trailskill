# External timing button: protocol, precision and feasibility

Research for issue #76 (task 7.1 of delivery phase 7). It answers the open item of the pilot design, sections 6.2 and 10: what hardware, protocol and precision the external timing button has, so the maintainer can decide whether and how task 7.2 (#77) is built.

- **Date of research:** 2026-11-08.
- **Status:** findings and a **proposal**. Nothing here is a confirmed product rule until the maintainer decides. Sections marked **TBD (to measure)** are filled after the precision test in section 4.
- **Sources:** the external Kotlin prototype (kept outside this repository, never copied), tested on an Android phone with the headset below, and the TrailSkill code at commit `5e51e8a`.
- **Personal data:** none. No athlete, coach or tester is named.

## 1. Answer

**Recommendation: build the Android module (#77) for USB headset buttons, behind the "arrival at time T" port, once the precision test in section 4 passes.** The protocol is plain Android key events, already proven on a real phone. iOS needs different hardware (a Bluetooth button that sends regular keyboard keys); the same port supports it later without changing the timing flow.

One finding changes the design of #77: the native timestamp and the JavaScript clock must share **one time base** (section 3.3). Otherwise a series started on screen and finished with the button would mix two clocks.

## 2. Hardware and protocol

### 2.1 Tested hardware

| Item | Value |
| --- | --- |
| Button | Inline control of a USB headset, Mpow PA071A, 4 buttons |
| Connection | USB-A plug to USB-C phone through an OTG adapter |
| What the phone sees | A USB audio device that also exposes HID consumer-control keys |
| Phone | TBD (model and Android version of the test phone) |

### 2.2 Events delivered (confirmed on device)

Confirmed with a key tester screen that logged every `KeyEvent` (key code, action, repeat count, source device name).

| Physical button | Android key code | Use in the prototype |
| --- | --- | --- |
| Speaker mute | `KEYCODE_VOLUME_MUTE` (164) | Unused |
| "−" | `KEYCODE_VOLUME_DOWN` (25) | Lap / split |
| "+" | `KEYCODE_VOLUME_UP` (24) | Start / finish / arrival |
| Microphone mute (blue LED) | No event reaches Android | Unused |

Each press arrives as `ACTION_DOWN` then `ACTION_UP`. Holding the button repeats `ACTION_DOWN` with `repeatCount > 0`.

The phone's own volume keys send the same key codes from a different input device. They work as a fallback when the headset fails, and the module can tell them apart by `InputDevice` (`isExternal`, API 29+).

### 2.3 What the prototype learned

- **Consuming the keys.** The activity must return `true` from `dispatchKeyEvent` for both `ACTION_DOWN` and `ACTION_UP` of a mapped key; otherwise the system volume changes and the volume panel covers the screen.
- **Repeats.** Only `ACTION_DOWN` with `repeatCount == 0` is a press. Repeats from a held button are ignored.
- **Debounce.** A second press of the same key within 250 ms is ignored. The prototype needed it: one physical press could produce two events.
- **Start lockout.** For 3 s after the start, start/finish presses are ignored (configurable 0–10 s), so a double tap cannot end a race at 0.4 s. In a TrailSkill series this would apply to the first arrival only.
- **Foreground only.** Keys are captured only while the app is in the foreground with the screen on. TrailSkill already keeps the screen awake while timing (`useAwakeWhile`).
- **Connection state.** `InputManager.InputDeviceListener` reports when the headset is connected or removed, so the app can show its state and offer the on-screen button at once.
- **Debugging.** While the headset uses the USB port, `adb` over USB is not available; wireless debugging (`adb pair` / `adb connect`, Android 11+) works.

## 3. Feasibility

### 3.1 Android

Feasible with a small Expo local module:

- The key hook must live in the activity (`dispatchKeyEvent`). Expo modules have no key-event hook, so the module needs a config plugin that adds the override to `MainActivity` during prebuild and forwards mapped keys to the module.
- The module emits one event per press: `{ keyCode, at, deviceExternal }`, and one event per connect or disconnect.
- Only key handling and the timestamp are native. Mapping, debounce and lockout are pure TypeScript in `src/modules/timing/domain/`, tested with a fake adapter, like `stopwatch.ts` and `series.ts`.
- Target SDK 36 is not affected: volume key dispatch to a foreground activity is unchanged. TBD: confirm on an Android 16 phone.

### 3.2 iOS

The USB headset does not work: iOS does not give apps hardware volume-key events. For iOS the button must be a Bluetooth HID device that sends **regular keyboard keys** (for example a page-turner remote), read with `UIKit` `pressesBegan`. That also works on Android (`KEYCODE_PAGE_DOWN`, `KEYCODE_ENTER` and similar), so one keyboard-key button could serve both platforms. TBD: hardware choice and test.

### 3.3 Clock and time base (affects #77)

Today the timing flows read `performance.now()` in JavaScript (`SeriesTimingFlow.tsx`, `IndividualTimingFlow.tsx`), and `arriveAt(at)` already accepts a mark from another source. The prototype read `SystemClock.elapsedRealtimeNanos()` at the top of `dispatchKeyEvent`.

These clocks do not share an origin, and `elapsedRealtime` keeps counting during deep sleep while the monotonic clock does not. If the start comes from the screen and the arrivals from the button, their difference would be meaningless.

Proposal: the native module exposes `now()` in the same base it uses for key events, and both timing flows use it for every mark (screen touches included) whenever the module is present. Without the module, `performance.now()` stays.

Timestamp source, to measure in section 4:

- **Option A:** clock read at the start of `dispatchKeyEvent`. Proven in the prototype. Includes the input pipeline delay.
- **Option B:** `KeyEvent.getEventTime()` (uptime base, milliseconds), the time the kernel received the event. Excludes most of the pipeline delay. TBD: whether a nanosecond variant is public at the target SDK.

### 3.4 Disconnection

When the headset is removed during a series, Android reports it through `InputDeviceListener`. Arrivals already recorded stay in the series because they are saved on the phone at each press. The flow keeps the on-screen button available the whole time, so the coach goes on without stopping. This matches the acceptance criterion of #77.

## 4. Precision test (method)

What matters is the **error of a time interval** (start to arrival), compared with a reference, at hundredths. Each result below must say the phone model, Android version and timestamp option (A or B).

### 4.1 Input pipeline delay and jitter

1. Connect the headset; connect `adb` wirelessly.
2. Run `adb shell getevent -lt` and a debug build that logs each press mark.
3. Press the button 50 times at random intervals.
4. For each press, compute app mark minus kernel event time.
5. Report mean, standard deviation and maximum, in ms.

A constant delay cancels out when start and arrival both come from the button. Jitter does not. **Pass:** standard deviation under 5 ms and maximum under 10 ms (one hundredth). Result: **TBD (to measure)**.

### 4.2 Interval against a reference stopwatch

1. Film at 240 fps (about 4.2 ms per frame) a handheld digital stopwatch showing hundredths, running, next to the headset button.
2. Press the button 21 times, 30 s to 2 min apart: 20 intervals.
3. For each press, read the reference at the frame where the button bottoms out.
4. Compare each interval from the video with the interval recorded by the app.
5. Report mean difference, maximum difference, and how many intervals differ by more than 0,01 s.

**Pass:** no interval differs by more than 0,02 s, and at least 18 of 20 within 0,01 s. Result: **TBD (to measure)**.

### 4.3 Mixed start

Repeat 4.2 with the start on screen and the arrivals on the button, using the shared clock of section 3.3. Same pass rule. Result: **TBD (to measure)**.

## 5. Questions for the maintainer

1. Do you approve the shared clock of section 3.3, so every mark of a series comes from the native module when it is present?
2. Should debounce (250 ms) and start lockout (3 s, configurable) be part of #77, or separate issues? The lockout needs a setting and its screen in the design system.
3. Should "learn key" (choosing which key is the button) and a key tester be in scope? They need a reference screen.
4. Which hardware do we test for iOS (a Bluetooth keyboard-key button)?
5. Do the pass thresholds in section 4 work for you before results count as official?
