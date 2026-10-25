import { fireEvent, render, screen } from '@testing-library/react-native';

import { AssignPlanScreen } from '../screens/AssignPlanScreen';

const content = {
  dateLabel: 'lunes, 2 de noviembre de 2026',
  plans: [],
  selectedPlanId: null,
  kinds: ['group' as const],
  kind: 'group' as const,
  options: [],
  selectedOptionId: null,
  assigned: [{ id: 'as1', planName: 'Plan p1', targetLabel: 'Grupo A', athleteCount: 2, canWithdraw: false }],
  saving: false,
};
const handlers = { onPreviousDay: jest.fn(), onNextDay: jest.fn(), onSelectPlan: jest.fn(), onSelectKind: jest.fn(), onSelectOption: jest.fn(), onAssign: jest.fn(), onWithdraw: jest.fn() };

describe('AssignPlanScreen fulfillment link', () => {
  it('opens the fulfillment grid of an assigned plan', async () => {
    const onOpenFulfillment = jest.fn();
    await render(<AssignPlanScreen view={{ kind: 'data', content }} {...handlers} onOpenFulfillment={onOpenFulfillment} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Marcar cumplimiento' }));
    expect(onOpenFulfillment).toHaveBeenCalledWith('as1');
  });

  it('has no such button when the caller gives no way to open it', async () => {
    await render(<AssignPlanScreen view={{ kind: 'data', content }} {...handlers} />);

    expect(screen.queryByRole('button', { name: 'Marcar cumplimiento' })).toBeNull();
  });
});
