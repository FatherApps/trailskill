import { fireEvent, render, screen } from '@testing-library/react-native';

import { AssignPlanContainer, AssignPlanScreen, createInMemoryAssignmentRepository, createInMemoryTrainingPlanRepository } from '..';
import { createInMemoryStaffSchoolRepository } from '../../school-console';
import { athletes, sources } from '../__fixtures__/assignments';
import { fulfillmentFixture } from '../__fixtures__/fulfillment';
import { plansFixture } from '../__fixtures__/plans';
import { FulfillmentScreen } from '../screens/FulfillmentScreen';
import { PlanBuilderScreen } from '../screens/PlanBuilderScreen';
import { PlanEditorScreen } from '../screens/PlanEditorScreen';
import { planVocabulary } from '../vocabulary';

// The school-console barrel pulls in the native PowerSync database; these tests use the in-memory repositories only.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));

const noop = jest.fn();
const back = () => screen.queryByRole('button', { name: 'Volver' });

// The plan editor, assign and fulfillment routes are stack screens: they draw the shared BackButton only when the route can go back.
describe('plan stack screens back button', () => {
  it('PlanBuilderScreen shows Volver only with onBack, and calls it', async () => {
    const onBack = jest.fn();
    const handlers = { onChangeName: noop, onAddBlock: noop, onEditBlock: noop, onMoveBlock: noop, onChangeBlock: noop, onDoneEditing: noop, onRemoveBlock: noop, onSave: noop, onSaveTemplate: noop };
    const element = (props: { onBack?: () => void }) => <PlanBuilderScreen planName="Plan" blocks={plansFixture.blocks} vocabulary={plansFixture.vocabulary} {...handlers} {...props} />;

    await render(element({}));
    expect(back()).toBeNull();

    await render(element({ onBack }));
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('AssignPlanScreen shows Volver only with onBack, and calls it', async () => {
    const onBack = jest.fn();
    const element = (props: { onBack?: () => void }) => (
      <AssignPlanScreen view={{ kind: 'loading' }} onPreviousDay={noop} onNextDay={noop} onSelectPlan={noop} onSelectKind={noop} onSelectOption={noop} onAssign={noop} onWithdraw={noop} {...props} />
    );

    await render(element({}));
    expect(back()).toBeNull();

    await render(element({ onBack }));
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('FulfillmentScreen shows Volver only with onBack, and calls it', async () => {
    const onBack = jest.fn();
    const { planName, dateLabel } = fulfillmentFixture;
    const element = (props: { onBack?: () => void }) => <FulfillmentScreen planName={planName} dateLabel={dateLabel} view={{ kind: 'loading' }} onCycle={noop} {...props} />;

    await render(element({}));
    expect(back()).toBeNull();

    await render(element({ onBack }));
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('AssignPlanContainer hands onBack to its screen', async () => {
    const onBack = jest.fn();
    const plans = createInMemoryTrainingPlanRepository();
    const element = (props: { onBack?: () => void }) => (
      <AssignPlanContainer
        plans={plans}
        assignments={createInMemoryAssignmentRepository(plans, () => 'admin')}
        athletes={athletes}
        structure={sources.structure}
        schools={sources.schools}
        userId="admin"
        initialDay="2026-11-02"
        {...props}
      />
    );

    await render(element({}));
    expect(back()).toBeNull();

    await render(element({ onBack }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('PlanEditorScreen shows Volver while loading and once the plan is ready, only with onBack', async () => {
    const onBack = jest.fn();
    const element = (props: { onBack?: () => void }) => (
      <PlanEditorScreen
        planId={null}
        repository={createInMemoryTrainingPlanRepository()}
        schools={createInMemoryStaffSchoolRepository([{ schoolId: 's1', schoolName: 'Escuela Sintética', userId: 'coach-1', role: 'coach' }])}
        userId="coach-1"
        vocabulary={planVocabulary()}
        {...props}
      />
    );

    await render(element({}));
    expect(await screen.findByRole('button', { name: 'Agregar bloque' })).toBeOnTheScreen();
    expect(back()).toBeNull();

    // A user without a school gets the "no school" state: the way back is still there.
    await render(
      <PlanEditorScreen planId={null} repository={createInMemoryTrainingPlanRepository()} schools={createInMemoryStaffSchoolRepository([])} userId="coach-1" vocabulary={planVocabulary()} onBack={onBack} />,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    await render(element({ onBack }));
    expect(await screen.findByRole('button', { name: 'Agregar bloque' })).toBeOnTheScreen();
    expect(back()).toBeOnTheScreen();
  });
});
