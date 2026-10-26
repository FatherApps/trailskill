import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { space, ThemeProvider } from '../../../core/theme';
import { coachesFixture, pendingCoachFixture } from '../__fixtures__/coaches';
import { CoachList, type CoachRow } from '../components/CoachList';
import { MEASURE_TIMEOUT_MS } from '../components/coachGrid';

const show = (coaches = coachesFixture) => render(<CoachList coaches={coaches} onDeactivate={jest.fn()} />);

// The list is hidden from the accessibility tree before it is measured, so the queries must include hidden elements.
const coachList = () => screen.getByTestId('coach-list', { includeHiddenElements: true });
const coachCards = () => screen.getAllByTestId('coach-card', { includeHiddenElements: true });

const measure = (width: number) =>
  act(() => fireEvent(coachList(), 'layout', { nativeEvent: { layout: { width, height: 400, x: 0, y: 0 } } }));

const maxWidths = () => coachCards().map((card) => StyleSheet.flatten(card.props.style).maxWidth);

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

describe('CoachList', () => {
  describe('before the first layout', () => {
    const list = () => StyleSheet.flatten(coachList().props.style);

    it('does not draw the cards until the row is measured, so the last odd card is never drawn stretched', async () => {
      await show();

      expect(list().opacity).toBe(0);

      await measure(1000);

      expect(list().opacity).toBe(1);
    });

    it('keeps the cards out of touch and out of the accessibility tree until the row is measured', async () => {
      await show();

      expect(coachList().props.pointerEvents).toBe('none');
      expect(coachList().props.importantForAccessibility).toBe('no-hide-descendants');
      expect(coachList().props.accessibilityElementsHidden).toBe(true);

      await measure(1000);

      expect(coachList().props.pointerEvents).toBe('auto');
      expect(coachList().props.importantForAccessibility).toBe('auto');
      expect(coachList().props.accessibilityElementsHidden).toBe(false);
    });

    describe('when there is nothing to measure, the list is visible and reachable from the start', () => {
      const reachable = () => {
        expect(list().opacity).toBe(1);
        expect(coachList().props.pointerEvents).toBe('auto');
        expect(coachList().props.importantForAccessibility).toBe('auto');
      };

      it('with an even count', async () => {
        await show(coachesFixture.slice(0, 2));

        reachable();
      });

      it('with an empty list', async () => {
        await show([]);

        reachable();
      });

      it('with one column (large text), even with an odd count', async () => {
        jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 2 }));
        await show();

        reachable();
      });
    });
  });

  describe('when onLayout does not arrive', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const opacity = () => StyleSheet.flatten(coachList().props.style).opacity;
    const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));

    it('shows the list uncapped once the deadline passes, and reachable', async () => {
      await show();

      await wait(MEASURE_TIMEOUT_MS - 1);
      expect(opacity()).toBe(0);

      await wait(1);
      expect(opacity()).toBe(1);
      expect(coachList().props.pointerEvents).toBe('auto');
      expect(coachList().props.importantForAccessibility).toBe('auto');
      expect(maxWidths()).toEqual([undefined, undefined, undefined]);
    });

    it('caps the last card when the measure arrives after the deadline: it does not stay stretched', async () => {
      await show();
      await wait(MEASURE_TIMEOUT_MS);

      await measure(1000);

      expect(opacity()).toBe(1);
      expect(maxWidths()).toEqual([undefined, undefined, (1000 - space[3]) / 2]);
    });

    // The measure deadline is the only timer set with this delay; the cards set others of their own.
    const deadlines = (spy: jest.SpyInstance) =>
      spy.mock.calls.flatMap((call, i) => (call[1] === MEASURE_TIMEOUT_MS ? [spy.mock.results[i].value] : []));

    it('clears the timer when the measure arrives in time', async () => {
      const set = jest.spyOn(globalThis, 'setTimeout');
      const clear = jest.spyOn(globalThis, 'clearTimeout');
      await show();
      const [deadline] = deadlines(set);

      await measure(1000);

      expect(clear).toHaveBeenCalledWith(deadline);
      await wait(MEASURE_TIMEOUT_MS * 2);
      expect(opacity()).toBe(1);
      expect(maxWidths()).toEqual([undefined, undefined, (1000 - space[3]) / 2]);
    });

    it('clears the timer when the list is unmounted', async () => {
      const set = jest.spyOn(globalThis, 'setTimeout');
      const clear = jest.spyOn(globalThis, 'clearTimeout');
      const { unmount } = await show();
      const [deadline] = deadlines(set);

      await unmount();

      expect(deadline).toBeDefined();
      expect(clear).toHaveBeenCalledWith(deadline);
    });

    it('sets no timer when there is nothing to measure', async () => {
      const set = jest.spyOn(globalThis, 'setTimeout');
      await show(coachesFixture.slice(0, 2));

      expect(deadlines(set)).toEqual([]);
    });
  });

  describe('the last card of an odd count in two columns', () => {
    it('is capped to the width of a card that shares its row, instead of stretching over the row', async () => {
      await show();
      await measure(1000);

      expect(maxWidths()).toEqual([undefined, undefined, (1000 - space[3]) / 2]);
    });

    it('is not capped when the count is even', async () => {
      await show(coachesFixture.slice(0, 2));
      await measure(1000);

      expect(maxWidths()).toEqual([undefined, undefined]);
    });

    it('is not capped when the row gives one column, where the card fills it', async () => {
      await show();
      await measure(400);

      expect(maxWidths()).toEqual([undefined, undefined, undefined]);
    });

    it('is not capped with large text, which gives one column', async () => {
      jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 2 }));
      await show();
      await measure(1000);

      expect(maxWidths()).toEqual([undefined, undefined, undefined]);
    });

    it('is capped too when it is the only card', async () => {
      await show(coachesFixture.slice(0, 1));
      await measure(1000);

      expect(maxWidths()).toEqual([(1000 - space[3]) / 2]);
    });
  });

  describe('when the text scale changes while the list is on screen', () => {
    const list = (fontScale: number) => (
      <ThemeProvider fontScale={fontScale}>
        <CoachList coaches={coachesFixture} onDeactivate={jest.fn()} />
      </ThemeProvider>
    );
    const cellBases = () => coachCards().map((card) => StyleSheet.flatten(card.props.style).flexBasis);

    // The gallery control at 200 %, or the system font changing live: native layout can keep the grid's narrow
    // cards when the cell style changes in place, so the list is rebuilt (and measured again, see below).
    it('gives one column at 200 % and goes back to the grid at 100 %', async () => {
      const { rerender } = await render(list(1));
      await measure(1000);
      expect(cellBases()).toEqual(['34%', '34%', '34%']);
      expect(maxWidths()).toEqual([undefined, undefined, (1000 - space[3]) / 2]);

      await rerender(list(2));
      await measure(1000);
      expect(cellBases()).toEqual(['100%', '100%', '100%']);
      expect(maxWidths()).toEqual([undefined, undefined, undefined]);

      await rerender(list(1));
      await measure(1000);
      expect(cellBases()).toEqual(['34%', '34%', '34%']);
      expect(maxWidths()).toEqual([undefined, undefined, (1000 - space[3]) / 2]);
    });

    it('does not draw a frame with the measure of the previous scale: the list waits for a new one', async () => {
      const { rerender } = await render(list(2));
      await measure(1000);
      await rerender(list(1));

      expect(StyleSheet.flatten(coachList().props.style).opacity).toBe(0);
      expect(coachList().props.pointerEvents).toBe('none');
      expect(maxWidths()).toEqual([undefined, undefined, undefined]);
    });
  });

  describe('when the row changes width at the same text scale', () => {
    it('measures again: the cap follows the row without rebuilding the list', async () => {
      await show();
      await measure(1000);
      const list = coachList();
      expect(maxWidths()).toEqual([undefined, undefined, (1000 - space[3]) / 2]);

      await measure(400);
      expect(maxWidths()).toEqual([undefined, undefined, undefined]);

      await measure(800);
      expect(maxWidths()).toEqual([undefined, undefined, (800 - space[3]) / 2]);
      expect(coachList()).toBe(list);
    });
  });

  describe('the model of a pending invitation', () => {
    it('has no athlete count: a count that is missing cannot be given as a number', () => {
      // The type refuses the zero; the runtime check that does not depend on typecheck covering the tests is in CoachesScreen.test.
      // @ts-expect-error a pending invitation has no count, and a zero would read as "no athletes"
      const zero: CoachRow = { ...pendingCoachFixture, athleteCount: 0 };

      expect(zero.status).toBe('pending');
    });
  });

  it('has no accidental export besides the list', () => {
    expect(Object.keys(jest.requireActual('../components/CoachList'))).toEqual(['CoachList']);
  });
});
