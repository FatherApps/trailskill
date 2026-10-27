import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StrictMode } from 'react';

import { createInMemoryStaffSchoolRepository } from '../../school-console';
import { createInMemoryAssignmentRepository } from '../data/inMemoryAssignmentRepository';
import { createInMemoryTrainingPlanRepository } from '../data/inMemoryTrainingPlanRepository';
import { dayLabel, shiftDay, todayText } from '../components/day';
import { AssignPlanContainer } from '../screens/AssignPlanContainer';
import type { AssignPlanScreenProps } from '../screens/AssignPlanScreen';

// The barrels pull in the native PowerSync database; these tests use the in-memory repositories only.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
// The assignments of the day shown; a test replaces it to hold, fail or fill the day.
let mockDayLoad: () => Promise<unknown[]> = async () => [];
// The school scope has its own tests; here it only has to load.
jest.mock('../data/assignable', () => ({
  ...jest.requireActual('../data/assignable'),
  loadAssignScope: async () => ({
    schoolId: 'school-1',
    inSchool: { athletes: [], groups: [{ id: 'group-1', name: 'Grupo A' }], categories: [] },
    athletes: [],
    groups: [{ id: 'group-1', name: 'Grupo A' }],
    categories: [],
    school: true,
  }),
  listAssignmentsOfDay: () => mockDayLoad(),
}));

// The real screen, with its latest props kept so a test can call a handler without going through the UI gate.
let mockScreenProps: AssignPlanScreenProps | undefined;
jest.mock('../screens/AssignPlanScreen', () => {
  const actual = jest.requireActual('../screens/AssignPlanScreen');
  const { createElement } = jest.requireActual('react');
  return {
    ...actual,
    AssignPlanScreen: (props: AssignPlanScreenProps) => {
      mockScreenProps = props;
      return createElement(actual.AssignPlanScreen, props);
    },
  };
});

beforeEach(() => {
  mockScreenProps = undefined;
  mockDayLoad = async () => [];
});

const screenProps = () => {
  if (!mockScreenProps) throw new Error('The screen has not rendered');
  return mockScreenProps;
};

const content = () => {
  const { view } = screenProps();
  if (view.kind !== 'data') throw new Error(`The screen shows ${view.kind}`);
  return view.content;
};

// The retry of the error view; throws when the screen shows anything else.
const retryOfError = () => {
  const { view } = screenProps();
  if (view.kind !== 'error') throw new Error(`The screen shows ${view.kind}`);
  return view.onRetry;
};

const assignmentOfDay = (id: string) => ({
  assignment: { id, schoolId: 'school-1', planId: 'plan-1', versionId: 'version-1', versionChanged: false, sessionDate: todayText(), target: { kind: 'school' } },
  athleteIds: [],
});

async function setup(initialPlanId?: string | string[], strict = false, initialDay?: string) {
  const plans = createInMemoryTrainingPlanRepository();
  for (const [id, name] of [['plan-1', 'Resistencia'], ['plan-2', 'Velocidad']]) {
    await plans.save({ id, schoolId: 'school-1', isTemplate: false, name, blocks: [] });
  }
  const assignments = createInMemoryAssignmentRepository(plans);
  // A plan hidden here leaves the school's list on the next load and comes back when shown again.
  const hidden = new Set<string>();
  // A held load keeps the next list pending, so a test can look at the screen while a new user's list is on its way.
  let held: Promise<void> | null = null;
  let failNext = false;
  const visiblePlans = {
    ...plans,
    list: async (schoolId: string) => {
      await held;
      if (failNext) {
        failNext = false;
        throw new Error('offline');
      }
      return (await plans.list(schoolId)).filter((p) => !hidden.has(p.id));
    },
  };
  const container = (planId?: string | string[], userId = 'coach-1') => (
    <AssignPlanContainer
      plans={visiblePlans}
      assignments={assignments}
      athletes={{} as never}
      structure={{} as never}
      schools={createInMemoryStaffSchoolRepository([
        { schoolId: 'school-1', schoolName: 'Escuela Sintética', userId: 'coach-1', role: 'coach' },
        { schoolId: 'school-1', schoolName: 'Escuela Sintética', userId: 'coach-2', role: 'coach' },
      ])}
      userId={userId}
      initialPlanId={planId}
      initialDay={initialDay}
    />
  );
  const element = (planId?: string | string[], userId?: string) => (strict ? <StrictMode>{container(planId, userId)}</StrictMode> : container(planId, userId));
  const view = await render(element(initialPlanId));
  await screen.findByText('Velocidad');
  return {
    assignments,
    hidden,
    // Returns the function that lets the held load finish.
    holdNextLoad: () => {
      let release = () => {};
      held = new Promise<void>((resolve) => {
        release = () => {
          held = null;
          resolve();
        };
      });
      return release;
    },
    // The next load of the school's list fails.
    failNextLoad: () => {
      failNext = true;
    },
    changeParam: (planId?: string | string[]) => view.rerender(element(planId)),
    // A new user id is what reloads the school's list with the screen mounted.
    reload: (planId?: string | string[], userId?: string) => view.rerender(element(planId, userId)),
  };
}

const selected = (name: string) => screen.getByRole('button', { name }).props.accessibilityState?.selected === true;

describe('AssignPlanContainer', () => {
  it('starts with the plan it was opened for selected', async () => {
    await setup('plan-2');

    expect(selected('Velocidad')).toBe(true);
    expect(selected('Resistencia')).toBe(false);
  });

  it('starts with no plan selected when none was given or the given one is not in the school', async () => {
    await setup('plan-unknown');

    expect(selected('Velocidad')).toBe(false);
    expect(selected('Resistencia')).toBe(false);
  });

  it('does not offer to assign when the given plan is not in the school', async () => {
    const { assignments } = await setup('plan-unknown');

    await fireEvent.press(screen.getByRole('radio', { name: 'Toda la escuela' }));

    expect(screen.queryByRole('button', { name: 'Asignar' })).toBeNull();
    expect(await assignments.list('school-1', todayText())).toEqual([]);
  });

  it('follows the plan parameter when it changes with the screen mounted', async () => {
    const { changeParam } = await setup('plan-1');
    expect(selected('Resistencia')).toBe(true);

    await changeParam('plan-2');

    expect(selected('Velocidad')).toBe(true);
    expect(selected('Resistencia')).toBe(false);
  });

  it('takes the first value of a repeated plan parameter', async () => {
    await setup(['plan-2', 'plan-1']);

    expect(selected('Velocidad')).toBe(true);
    expect(selected('Resistencia')).toBe(false);
  });

  it('selects no plan when a repeated plan parameter has no valid first value', async () => {
    await setup(['plan-unknown', 'plan-1']);

    expect(selected('Velocidad')).toBe(false);
    expect(selected('Resistencia')).toBe(false);
  });

  it('takes the first non-empty value of a repeated plan parameter', async () => {
    await setup(['', 'plan-2']);

    expect(selected('Velocidad')).toBe(true);
    expect(selected('Resistencia')).toBe(false);
  });

  it('selects no plan when every value of a repeated plan parameter is empty', async () => {
    await setup(['', '']);

    expect(selected('Velocidad')).toBe(false);
    expect(selected('Resistencia')).toBe(false);
  });

  it('keeps a manual choice when the same plan parameter arrives again', async () => {
    const { changeParam } = await setup('plan-1');
    await fireEvent.press(screen.getByRole('button', { name: 'Velocidad' }));

    await changeParam('plan-1');

    expect(selected('Velocidad')).toBe(true);
    expect(selected('Resistencia')).toBe(false);
  });

  it('applies the plan parameter again when it comes back after another value', async () => {
    const { changeParam } = await setup('plan-1');
    await fireEvent.press(screen.getByRole('button', { name: 'Velocidad' }));

    await changeParam('plan-2');
    await changeParam('plan-1');

    expect(selected('Resistencia')).toBe(true);
    expect(selected('Velocidad')).toBe(false);
  });

  it('does not select a plan again that left the list and came back after a manual choice', async () => {
    const { hidden, reload } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Resistencia' }));
    expect(selected('Resistencia')).toBe(true);

    hidden.add('plan-1');
    await reload(undefined, 'coach-2');
    await waitFor(() => expect(screen.queryByText('Resistencia')).toBeNull());
    hidden.delete('plan-1');
    await reload(undefined, 'coach-1');
    await screen.findByText('Resistencia');

    expect(selected('Resistencia')).toBe(false);
    expect(selected('Velocidad')).toBe(false);
  });

  describe('when the user changes with the screen mounted', () => {
    it('shows no list of the previous user while the new one loads', async () => {
      const { holdNextLoad, reload } = await setup('plan-1');
      expect(selected('Resistencia')).toBe(true);
      const release = holdNextLoad();

      await reload('plan-1', 'coach-2');

      expect(screen.queryByText('Resistencia')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Asignar' })).toBeNull();
      await act(async () => release());
      await screen.findByText('Resistencia');
      expect(selected('Resistencia')).toBe(true);
    });

    it('does not carry a manual choice over to the new user', async () => {
      const { holdNextLoad, reload } = await setup();
      await fireEvent.press(screen.getByRole('button', { name: 'Velocidad' }));
      expect(selected('Velocidad')).toBe(true);
      const release = holdNextLoad();

      await reload(undefined, 'coach-2');
      await act(async () => release());
      await screen.findByText('Velocidad');

      expect(selected('Velocidad')).toBe(false);
      expect(selected('Resistencia')).toBe(false);
    });

    it('shows no assignment of the previous user while the new one loads its day', async () => {
      mockDayLoad = async () => [assignmentOfDay('assignment-1')];
      const { reload } = await setup('plan-1');
      await screen.findByTestId('assigned-assignment-1');
      let release = () => {};
      mockDayLoad = () => new Promise((resolve) => (release = () => resolve([])));

      await reload('plan-1', 'coach-2');
      await screen.findByText('Velocidad');

      expect(screen.queryByTestId('assigned-assignment-1')).toBeNull();
      await act(async () => release());
    });

    it.each([
      ['today', undefined, todayText()],
      ['the initial day', '2026-03-10', '2026-03-10'],
    ])('goes back to %s instead of keeping the day of the previous user', async (_name, initialDay, expected) => {
      const { reload } = await setup('plan-1', false, initialDay);
      await act(async () => screenProps().onNextDay());
      expect(content().dateLabel).toBe(dayLabel(shiftDay(expected, 1)));

      await reload('plan-1', 'coach-2');
      await screen.findByText('Velocidad');

      expect(content().dateLabel).toBe(dayLabel(expected));
    });

    it('starts over with the group kind', async () => {
      const { reload } = await setup('plan-1');
      await act(async () => screenProps().onSelectKind('school'));
      expect(content().kind).toBe('school');

      await reload('plan-1', 'coach-2');
      await screen.findByText('Velocidad');

      expect(content().kind).toBe('group');
    });

    it('does not carry the chosen target over to the new user', async () => {
      const { reload } = await setup('plan-1');
      await act(async () => screenProps().onSelectOption('group-1'));
      expect(content().selectedOptionId).toBe('group-1');

      await reload('plan-1', 'coach-2');
      await screen.findByText('Velocidad');

      expect(content().selectedOptionId).toBeNull();
    });

    it('does not carry a failure over to the new user', async () => {
      const { assignments, reload } = await setup('plan-1');
      jest.spyOn(assignments, 'create').mockRejectedValueOnce(new Error('offline'));
      await act(async () => screenProps().onSelectKind('school'));
      await act(async () => screenProps().onAssign());
      expect(content().failure).toBe('save');

      await reload('plan-1', 'coach-2');
      await screen.findByText('Velocidad');

      expect(content().failure).toBeUndefined();
    });

    it('shows the new user as loading, not the error of the previous one', async () => {
      const { failNextLoad, holdNextLoad, reload } = await setup('plan-1');
      failNextLoad();
      await reload('plan-1', 'coach-2');
      await waitFor(() => expect(screenProps().view.kind).toBe('error'));
      const release = holdNextLoad();

      await reload('plan-1', 'coach-1');

      expect(screenProps().view.kind).toBe('loading');
      await act(async () => release());
      await screen.findByText('Velocidad');
    });

    it('shows the new user as loading, not the missing school of the previous one', async () => {
      const { holdNextLoad, reload } = await setup('plan-1');
      await reload('plan-1', 'coach-without-school');
      await waitFor(() => expect(screenProps().view.kind).toBe('no_school'));
      const release = holdNextLoad();

      await reload('plan-1', 'coach-1');

      expect(screenProps().view.kind).toBe('loading');
      await act(async () => release());
      await screen.findByText('Velocidad');
    });

    it('does not let a save of the previous user hold the new user or write its failure', async () => {
      const { assignments, reload } = await setup('plan-1');
      let fail = (_: Error) => {};
      const create = jest.spyOn(assignments, 'create').mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
      await act(async () => screenProps().onSelectKind('school'));
      await act(async () => {
        void screenProps().onAssign();
      });
      expect(content().saving).toBe(true);

      await reload('plan-1', 'coach-2');
      await screen.findByText('Velocidad');
      expect(content().saving).toBe(false);
      await act(async () => screenProps().onSelectKind('school'));
      await act(async () => screenProps().onAssign());
      expect(create).toHaveBeenCalledTimes(2);
      await act(async () => fail(new Error('offline')));

      expect(content().failure).toBeUndefined();
    });

    it('does not let a withdrawal of the previous user hold the new user or write its failure', async () => {
      mockDayLoad = async () => [assignmentOfDay('assignment-1')];
      const { assignments, reload } = await setup('plan-1');
      await screen.findByTestId('assigned-assignment-1');
      let fail = (_: Error) => {};
      const withdraw = jest
        .spyOn(assignments, 'withdraw')
        .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
        .mockResolvedValueOnce(undefined);
      await act(async () => {
        void screenProps().onWithdraw('assignment-1');
      });

      await reload('plan-1', 'coach-2');
      await screen.findByTestId('assigned-assignment-1');
      await act(async () => screenProps().onWithdraw('assignment-1'));
      expect(withdraw).toHaveBeenCalledTimes(2);
      await act(async () => fail(new Error('offline')));

      expect(content().failure).toBeUndefined();
    });

    // The remount only cuts the UI: the repository write of the previous user still finishes on the device.
    it('still writes the save of the previous user to the repository', async () => {
      const { assignments, reload } = await setup('plan-1');
      const create = assignments.create;
      let release = () => {};
      jest.spyOn(assignments, 'create').mockImplementationOnce(async (assignment) => {
        await new Promise<void>((resolve) => (release = resolve));
        return create(assignment);
      });
      await act(async () => screenProps().onSelectKind('school'));
      await act(async () => {
        void screenProps().onAssign();
      });

      await reload('plan-1', 'coach-2');
      await screen.findByText('Velocidad');
      expect(await assignments.list('school-1', todayText())).toEqual([]);
      await act(async () => release());

      expect(await assignments.list('school-1', todayText())).toEqual([expect.objectContaining({ planId: 'plan-1', target: { kind: 'school' } })]);
      expect(content().saving).toBe(false);
    });

    it('still writes the withdrawal of the previous user to the repository', async () => {
      mockDayLoad = async () => [assignmentOfDay('assignment-1')];
      const { assignments, reload } = await setup('plan-1');
      const id = await assignments.create({ schoolId: 'school-1', planId: 'plan-1', sessionDate: todayText(), target: { kind: 'school' } });
      expect(id).toBe('assignment-1');
      await screen.findByTestId('assigned-assignment-1');
      const withdraw = assignments.withdraw;
      let release = () => {};
      jest.spyOn(assignments, 'withdraw').mockImplementationOnce(async (assignmentId) => {
        await new Promise<void>((resolve) => (release = resolve));
        return withdraw(assignmentId);
      });
      await act(async () => {
        void screenProps().onWithdraw(id);
      });

      await reload('plan-1', 'coach-2');
      await screen.findByText('Velocidad');
      expect(await assignments.list('school-1', todayText())).toHaveLength(1);
      await act(async () => release());

      expect(await assignments.list('school-1', todayText())).toEqual([]);
    });
  });

  describe('the picked plan', () => {
    it('is dropped when a new list of the same user lacks it, and does not come back with a later one', async () => {
      const { hidden } = await setup();
      const dayLoad = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
      mockDayLoad = dayLoad;
      const reloadList = async () => {
        // A failing day sends the screen to the error view, whose retry loads the list again.
        await act(async () => screenProps().onNextDay());
        await waitFor(() => expect(screenProps().view.kind).toBe('error'));
        await act(async () => retryOfError()());
      };
      await fireEvent.press(screen.getByRole('button', { name: 'Resistencia' }));

      hidden.add('plan-1');
      await reloadList();
      await waitFor(() => expect(screen.queryByText('Resistencia')).toBeNull());
      hidden.delete('plan-1');
      dayLoad.mockRejectedValueOnce(new Error('offline'));
      await reloadList();
      await screen.findByText('Resistencia');

      expect(selected('Resistencia')).toBe(false);
    });

    it.each([false, true])('is dropped when the parameter changes and applied again when it comes back (strict mode %s)', async (strict) => {
      const { changeParam } = await setup('plan-1', strict);
      await fireEvent.press(screen.getByRole('button', { name: 'Velocidad' }));

      await changeParam('plan-2');
      expect(selected('Velocidad')).toBe(true);
      await changeParam('plan-1');

      expect(selected('Resistencia')).toBe(true);
      expect(selected('Velocidad')).toBe(false);
    });
  });

  it('treats an empty plan parameter as no parameter', async () => {
    const { changeParam } = await setup('');
    expect(selected('Velocidad')).toBe(false);
    expect(selected('Resistencia')).toBe(false);

    await changeParam('plan-1');
    expect(selected('Resistencia')).toBe(true);

    await changeParam('');
    expect(selected('Resistencia')).toBe(false);
  });

  describe('the Assign gate', () => {
    it('shows no Assign label while no plan of the school is chosen', async () => {
      await setup('plan-unknown');
      await fireEvent.press(screen.getByRole('radio', { name: 'Toda la escuela' }));

      expect(screen.queryByText('Asignar')).toBeNull();
    });

    it('shows no Assign label while the kind needs a target and none is chosen', async () => {
      await setup('plan-1');

      expect(screen.queryByText('Asignar')).toBeNull();
    });

    it('shows the Assign label once a plan and a target are chosen', async () => {
      await setup('plan-1');
      await fireEvent.press(screen.getByRole('radio', { name: 'Toda la escuela' }));

      expect(screen.getByText('Asignar')).toBeTruthy();
    });
  });

  describe('saving without the button', () => {
    it('writes nothing when no plan of the school is chosen', async () => {
      const { assignments } = await setup('plan-unknown');
      const create = jest.spyOn(assignments, 'create');
      await fireEvent.press(screen.getByRole('radio', { name: 'Toda la escuela' }));

      await act(async () => screenProps().onAssign());

      expect(create).not.toHaveBeenCalled();
      expect(await assignments.list('school-1', todayText())).toEqual([]);
    });

    it('writes nothing when the kind needs a target and none is chosen', async () => {
      const { assignments } = await setup('plan-1');
      const create = jest.spyOn(assignments, 'create');

      await act(async () => screenProps().onAssign());

      expect(create).not.toHaveBeenCalled();
      // Without the guard the missing target throws and the screen shows a failure.
      expect(screenProps().view).toMatchObject({ kind: 'data', content: { failure: undefined, saving: false } });
    });

    it('writes the assignment when a plan and a target are chosen', async () => {
      const { assignments } = await setup('plan-1');
      const create = jest.spyOn(assignments, 'create');
      await fireEvent.press(screen.getByRole('radio', { name: 'Toda la escuela' }));

      await act(async () => screenProps().onAssign());

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ planId: 'plan-1', target: { kind: 'school' } }));
    });
  });
});
