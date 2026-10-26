import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { space } from '../../../core/theme';
import { coachesFixture, pendingCoachFixture } from '../__fixtures__/coaches';
import { CoachList, type CoachRow } from '../components/CoachList';

const show = (coaches = coachesFixture) => render(<CoachList coaches={coaches} onDeactivate={jest.fn()} />);

const measure = (width: number) =>
  act(() => fireEvent(screen.getByTestId('coach-list'), 'layout', { nativeEvent: { layout: { width, height: 400, x: 0, y: 0 } } }));

const maxWidths = () => screen.getAllByTestId('coach-card').map((card) => StyleSheet.flatten(card.props.style).maxWidth);

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

describe('CoachList', () => {
  describe('before the first layout', () => {
    it('does not draw the cards until the row is measured, so the last odd card is never drawn stretched', async () => {
      await show();

      expect(StyleSheet.flatten(screen.getByTestId('coach-list').props.style).opacity).toBe(0);

      await measure(1000);

      expect(StyleSheet.flatten(screen.getByTestId('coach-list').props.style).opacity).toBe(1);
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

  describe('the model of a pending invitation', () => {
    it('has no athlete count: a count that is missing cannot be given as a number', () => {
      // @ts-expect-error a pending invitation has no count, and a zero would read as "no athletes"
      const zero: CoachRow = { ...pendingCoachFixture, athleteCount: 0 };

      expect(zero.status).toBe('pending');
    });
  });
});
