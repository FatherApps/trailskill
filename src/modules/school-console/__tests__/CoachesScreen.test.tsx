import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { coachesFixture, inviteGroupsFixture, pendingCoachFixture } from '../__fixtures__/coaches';
import { schoolNameFixture, storedOnFixture } from '../__fixtures__/athletes';
import { CoachesScreen, type CoachesContent, type CoachesScreenProps, type CoachesView } from '../screens/CoachesScreen';

const content: CoachesContent = { updatedMinutesAgo: 2, coaches: coachesFixture };

const show = async (view: CoachesView, extra: Partial<CoachesScreenProps> = {}) => {
  const actions = { onNavigate: jest.fn(), onInvite: jest.fn(), onDeactivate: jest.fn() };
  await render(<CoachesScreen width={1280} schoolName={schoolNameFixture} view={view} {...actions} {...extra} />);
  return actions;
};

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

describe('CoachesScreen', () => {
  describe('with data', () => {
    it('shows the title, the caption, and a card per coach with state, groups and number of athletes', async () => {
      await show({ kind: 'data', content });

      expect(screen.getByRole('header', { name: 'Entrenadores' })).toBeOnTheScreen();
      expect(screen.getByText('3 entrenadores · Actualizado hace 2 min')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Entrenadores' })).toBeSelected();
      expect(screen.getAllByTestId('coach-card')).toHaveLength(3);
      expect(screen.getByText('Paula Gutiérrez')).toBeOnTheScreen();
      // The initials are decoration: the name is read already.
      expect(screen.getByText('PG', { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.getByText('Grupo A · Grupo B · 24 deportistas')).toBeOnTheScreen();
      expect(screen.getByText('Grupo C · 1 deportista')).toBeOnTheScreen();
      expect(screen.getByText('Sin grupos · 0 deportistas')).toBeOnTheScreen();
      expect(screen.getAllByLabelText('Activo')).toHaveLength(3);
    });

    it('shows Sin dato, never an invented name, when the name is not readable', async () => {
      await show({ kind: 'data', content: { updatedMinutesAgo: 2, coaches: [{ ...coachesFixture[0]!, name: null, initials: '' }] } });

      expect(screen.getByText('Sin dato')).toBeOnTheScreen();
      expect(screen.queryByText('PG', { includeHiddenElements: true })).toBeNull();
    });

    it('shows no contact, document, code, SMS or inherited-permissions text', async () => {
      await show({ kind: 'data', content }, { groups: inviteGroupsFixture });
      await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));

      expect(screen.queryByText(/TS-|Copiar|SMS|Hereda|celular/i)).toBeNull();
    });

    it('passes the navigation to the caller', async () => {
      const { onNavigate } = await show({ kind: 'data', content });

      await fireEvent.press(screen.getByRole('tab', { name: 'Récords' }));

      expect(onNavigate).toHaveBeenCalledWith('records');
    });
  });

  describe('a pending invitation', () => {
    const withPending: CoachesContent = { updatedMinutesAgo: 2, coaches: [...coachesFixture, pendingCoachFixture] };

    it('is drawn with a dashed border and the text Invitación enviada, not by the border alone', async () => {
      await show({ kind: 'data', content: withPending });

      expect(screen.getByText('Julio Castaño')).toBeOnTheScreen();
      expect(screen.getByLabelText('Invitación enviada')).toBeOnTheScreen();
      expect(StyleSheet.flatten(screen.getByTestId('pending-card').props.style).borderStyle).toBe('dashed');
      expect(screen.getAllByLabelText('Activo')).toHaveLength(3);
    });

    it('has nothing to deactivate', async () => {
      await show({ kind: 'data', content: withPending }, { deactivateAvailable: true });

      expect(screen.getAllByRole('button', { name: 'Desactivar' })).toHaveLength(3);
    });
  });

  describe('the invite sheet', () => {
    const open = async (extra: Partial<CoachesScreenProps> = {}) => {
      const actions = await show({ kind: 'data', content }, { groups: inviteGroupsFixture, ...extra });
      await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
      return actions;
    };

    it('opens a side sheet with a title, name and email fields and one chip per group of the school', async () => {
      await open();

      expect(screen.getByTestId('side-sheet')).toBeOnTheScreen();
      expect(screen.getAllByRole('header', { name: 'Invitar entrenador' }).length).toBeGreaterThan(0);
      expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
      expect(screen.getByLabelText('Correo')).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'Grupo A' })).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'Grupo B' })).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'Grupo C' })).toBeOnTheScreen();
    });

    it('does not send until the name and an email are filled', async () => {
      const { onInvite } = await open();

      expect(screen.getByRole('button', { name: 'Enviar invitación · Escribe el nombre y un correo válido' })).toBeDisabled();
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa Londoño');
      await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa');
      expect(screen.getByRole('button', { name: /^Enviar invitación/ })).toBeDisabled();
      expect(onInvite).not.toHaveBeenCalled();
    });

    it('confirming calls onInvite with the name, the email and the chosen groups, and closes the sheet', async () => {
      const { onInvite } = await open();

      await fireEvent.changeText(screen.getByLabelText('Nombre'), '  Rosa Londoño ');
      await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.com');
      await fireEvent.press(screen.getByRole('radio', { name: 'Grupo A' }));
      await fireEvent.press(screen.getByRole('radio', { name: 'Grupo C' }));
      await fireEvent.press(screen.getByRole('radio', { name: 'Grupo A' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));

      expect(onInvite).toHaveBeenCalledTimes(1);
      expect(onInvite).toHaveBeenCalledWith({ name: 'Rosa Londoño', email: 'rosa@example.com', groupIds: ['g3'] });
      expect(screen.queryByTestId('side-sheet')).toBeNull();
    });

    it('closing the sheet calls nothing', async () => {
      const { onInvite } = await open();

      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa Londoño');
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));

      expect(onInvite).not.toHaveBeenCalled();
      expect(screen.queryByTestId('side-sheet')).toBeNull();
    });

    it('starts empty each time it opens', async () => {
      await open();
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa Londoño');
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));

      expect(screen.getByLabelText('Nombre')).toHaveDisplayValue('');
    });

    it('opens with the group of the context already chosen, and sends it', async () => {
      const { onInvite } = await open({ contextGroupId: 'g2' });

      expect(screen.getByRole('radio', { name: 'Grupo B' })).toHaveProp('accessibilityState', { checked: true, selected: true });
      expect(screen.getByRole('radio', { name: 'Grupo A' })).toHaveProp('accessibilityState', { checked: false, selected: false });

      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa Londoño');
      await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.com');
      await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));

      expect(onInvite).toHaveBeenCalledWith({ name: 'Rosa Londoño', email: 'rosa@example.com', groupIds: ['g2'] });
    });

    it('ignores a context group the school does not have', async () => {
      await open({ contextGroupId: 'g9' });

      expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
    });

    describe('when the groups or the context change with the sheet open', () => {
      const [groupA, groupB, groupC] = inviteGroupsFixture;
      const props = (extra: Partial<CoachesScreenProps> = {}) => ({
        width: 1280,
        schoolName: schoolNameFixture,
        view: { kind: 'data', content } as CoachesView,
        onNavigate: jest.fn(),
        onInvite: jest.fn(),
        onDeactivate: jest.fn(),
        ...extra,
      });

      it('shows a group that arrives and lets it be chosen, keeping what was already chosen', async () => {
        const base = props({ groups: [groupA!, groupB!] });
        const view = await render(<CoachesScreen {...base} />);
        await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
        await fireEvent.press(screen.getByRole('radio', { name: 'Grupo A' }));

        await view.rerender(<CoachesScreen {...base} groups={[groupA!, groupB!, groupC!]} />);
        expect(screen.getByRole('radio', { name: 'Grupo C' })).toBeOnTheScreen();
        expect(screen.getByRole('radio', { name: 'Grupo A' })).toBeChecked();

        await fireEvent.press(screen.getByRole('radio', { name: 'Grupo C' }));
        expect(screen.getByRole('radio', { name: 'Grupo A' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'Grupo C' })).toBeChecked();
      });

      it('chooses the context group when the groups arrive after the sheet opened', async () => {
        const base = props({ contextGroupId: 'g2' });
        const view = await render(<CoachesScreen {...base} />);
        await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));

        await view.rerender(<CoachesScreen {...base} groups={inviteGroupsFixture} />);

        expect(screen.getByRole('radio', { name: 'Grupo B' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'Grupo A' })).not.toBeChecked();
      });

      it('follows a new context group, but never undoes what the user chose or cleared', async () => {
        const base = props({ groups: inviteGroupsFixture, contextGroupId: 'g2' });
        const view = await render(<CoachesScreen {...base} />);
        await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
        await fireEvent.press(screen.getByRole('radio', { name: 'Grupo B' }));
        await fireEvent.press(screen.getByRole('radio', { name: 'Grupo A' }));

        await view.rerender(<CoachesScreen {...base} contextGroupId="g3" />);

        expect(screen.getByRole('radio', { name: 'Grupo A' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'Grupo B' })).not.toBeChecked();
        expect(screen.getByRole('radio', { name: 'Grupo C' })).toBeChecked();
      });

      it('sends only groups that still exist', async () => {
        const base = props({ groups: inviteGroupsFixture });
        const view = await render(<CoachesScreen {...base} />);
        await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
        await fireEvent.press(screen.getByRole('radio', { name: 'Grupo A' }));
        await fireEvent.press(screen.getByRole('radio', { name: 'Grupo B' }));
        await view.rerender(<CoachesScreen {...base} groups={[groupB!, groupC!]} />);
        await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa Londoño');
        await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.com');

        await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));

        expect(base.onInvite).toHaveBeenCalledWith({ name: 'Rosa Londoño', email: 'rosa@example.com', groupIds: ['g2'] });
      });
    });

    describe('when the invitation fails', () => {
      const fill = async () => {
        await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa Londoño');
        await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.com');
        await fireEvent.press(screen.getByRole('radio', { name: 'Grupo A' }));
      };

      it('keeps the sheet open with what was typed and says it failed', async () => {
        const onInvite = jest.fn().mockRejectedValue(new Error('offline'));
        await show({ kind: 'data', content }, { groups: inviteGroupsFixture, onInvite });
        await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
        await fill();

        await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));

        expect(onInvite).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('side-sheet')).toBeOnTheScreen();
        expect(screen.getByLabelText('Nombre')).toHaveDisplayValue('Rosa Londoño');
        expect(screen.getByLabelText('Correo')).toHaveDisplayValue('rosa@example.com');
        expect(screen.getByRole('radio', { name: 'Grupo A' })).toBeChecked();
        expect(screen.getByText('No pudimos enviar la invitación. Inténtalo de nuevo.')).toBeOnTheScreen();
      });

      it('closes the sheet when a retry works, and sends the same data again', async () => {
        const onInvite = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
        await show({ kind: 'data', content }, { groups: inviteGroupsFixture, onInvite });
        await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
        await fill();
        await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));

        await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));

        expect(onInvite).toHaveBeenCalledTimes(2);
        expect(onInvite).toHaveBeenLastCalledWith({ name: 'Rosa Londoño', email: 'rosa@example.com', groupIds: ['g1'] });
        expect(screen.queryByTestId('side-sheet')).toBeNull();
      });

      it('stays open until a slow invitation ends, and does not send twice meanwhile', async () => {
        let finish!: () => void;
        const onInvite = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
        await show({ kind: 'data', content }, { groups: inviteGroupsFixture, onInvite });
        await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
        await fill();

        await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));
        await fireEvent.press(screen.getByRole('button', { name: /^Enviar invitación/ }));

        expect(onInvite).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('side-sheet')).toBeOnTheScreen();

        await act(async () => finish());
        expect(screen.queryByTestId('side-sheet')).toBeNull();
      });
    });

    describe('when the groups are not available', () => {
      const fill = async () => {
        await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa Londoño');
        await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.com');
      };

      it('while they load, says so instead of showing no groups, and does not invite', async () => {
        const { onInvite } = await open({ groups: 'loading' });
        await fill();

        expect(screen.getByText('Cargando grupos…')).toBeOnTheScreen();
        expect(screen.queryByRole('radio')).toBeNull();
        const send = screen.getByRole('button', { name: 'Enviar invitación · Espera a que carguen los grupos' });
        expect(send).toBeDisabled();
        await fireEvent.press(send);
        expect(onInvite).not.toHaveBeenCalled();
      });

      it('when they fail to load, shows an error in the groups area and does not invite', async () => {
        const { onInvite } = await open({ groups: 'error' });
        await fill();

        expect(screen.getByText('No pudimos cargar los grupos.')).toBeOnTheScreen();
        expect(screen.queryByRole('radio')).toBeNull();
        const send = screen.getByRole('button', { name: 'Enviar invitación · Faltan los grupos de la escuela' });
        expect(send).toBeDisabled();
        await fireEvent.press(send);
        expect(onInvite).not.toHaveBeenCalled();
      });

      it('lets the invitation go once they arrive, with what was typed', async () => {
        const base = { width: 1280, schoolName: schoolNameFixture, view: { kind: 'data', content } as CoachesView, onNavigate: jest.fn(), onInvite: jest.fn(), onDeactivate: jest.fn() };
        const view = await render(<CoachesScreen {...base} groups="loading" />);
        await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
        await fill();

        await view.rerender(<CoachesScreen {...base} groups={inviteGroupsFixture} />);

        expect(screen.queryByText('Cargando grupos…')).toBeNull();
        expect(screen.getByRole('radio', { name: 'Grupo A' })).toBeOnTheScreen();
        await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));
        expect(base.onInvite).toHaveBeenCalledWith({ name: 'Rosa Londoño', email: 'rosa@example.com', groupIds: [] });
      });

      it('still invites when the school really has no groups', async () => {
        const { onInvite } = await open({ groups: [] });
        await fill();

        expect(screen.queryByText('Cargando grupos…')).toBeNull();
        await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));
        expect(onInvite).toHaveBeenCalledTimes(1);
      });
    });

    describe('while sending', () => {
      const sendSlow = async () => {
        let finish!: () => void;
        const onInvite = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
        await show({ kind: 'data', content }, { groups: inviteGroupsFixture, onInvite });
        await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
        await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa Londoño');
        await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.com');
        await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));
        return { onInvite, finish: () => act(async () => finish()) };
      };

      it('shows the button busy and does not take edits or closes', async () => {
        await sendSlow();

        const send = screen.getByRole('button', { name: 'Enviar invitación' });
        expect(send).toBeBusy();
        expect(send).toBeDisabled();
        await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Otro');
        await fireEvent.press(screen.getByRole('radio', { name: 'Grupo B' }));
        expect(screen.getByLabelText('Nombre')).toHaveDisplayValue('Rosa Londoño');
        expect(screen.getByRole('radio', { name: 'Grupo B' })).not.toBeChecked();
        await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
        await fireEvent.press(screen.getByTestId('side-sheet-scrim'));
        expect(screen.getByTestId('side-sheet')).toBeOnTheScreen();
      });

      it('takes edits and closes again once the invitation fails', async () => {
        const onInvite = jest.fn().mockRejectedValue(new Error('offline'));
        await show({ kind: 'data', content }, { groups: inviteGroupsFixture, onInvite });
        await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
        await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa Londoño');
        await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.com');
        await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));

        await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Otro');
        expect(screen.getByLabelText('Nombre')).toHaveDisplayValue('Otro');
        await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
        expect(screen.queryByTestId('side-sheet')).toBeNull();
      });

      it('sends once even when the button is pressed twice before the sheet draws again', async () => {
        const onInvite = jest.fn(() => new Promise<void>(() => {}));
        await show({ kind: 'data', content }, { groups: inviteGroupsFixture, onInvite });
        await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
        await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa Londoño');
        await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.com');
        const send = screen.getByRole('button', { name: 'Enviar invitación' });

        await act(async () => {
          void fireEvent.press(send);
          void fireEvent.press(send);
        });

        expect(onInvite).toHaveBeenCalledTimes(1);
      });

      it('does not let an invitation from a previous opening close the sheet opened afterwards', async () => {
        const { onInvite, finish } = await sendSlow();

        // The sheet is opened again from the action (hidden from screen readers behind the sheet) while the first invitation is still running.
        await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador', includeHiddenElements: true }));
        expect(screen.getByLabelText('Nombre')).toHaveDisplayValue('');
        await finish();

        expect(onInvite).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('side-sheet')).toBeOnTheScreen();
        expect(screen.getByRole('button', { name: /^Enviar invitación/ })).not.toBeBusy();
      });
    });

    describe('the invitation error', () => {
      const failOnce = async () => {
        const error = new Error('offline');
        const onInvite = jest.fn().mockRejectedValue(error);
        await show({ kind: 'data', content }, { groups: inviteGroupsFixture, onInvite });
        await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
        await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa Londoño');
        await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.com');
        await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));
        return error;
      };
      const banner = 'No pudimos enviar la invitación. Inténtalo de nuevo.';

      it('is logged with its cause', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const error = await failOnce();

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('[school-console]'), error);
      });

      it.each([
        ['the name', () => fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa')],
        ['the email', () => fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.org')],
        ['the groups', () => fireEvent.press(screen.getByRole('radio', { name: 'Grupo B' }))],
      ])('goes away when %s is edited', async (_edited, edit) => {
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        await failOnce();
        expect(screen.getByText(banner)).toBeOnTheScreen();

        await edit();

        expect(screen.queryByText(banner)).toBeNull();
      });
    });
  });

  describe('deactivating', () => {
    it('is shown disabled on every active card until it is available, and opens nothing', async () => {
      const { onDeactivate } = await show({ kind: 'data', content });

      const buttons = screen.getAllByRole('button', { name: 'Desactivar · Aún no disponible' });
      expect(buttons).toHaveLength(3);
      expect(buttons[0]).toBeDisabled();

      await fireEvent.press(buttons[0]);

      expect(screen.queryByText(/^¿Desactivar a/)).toBeNull();
      expect(onDeactivate).not.toHaveBeenCalled();
    });

    it('when available, asks with a destructive ConfirmSheet that names the coach and deactivates on confirm', async () => {
      const { onDeactivate } = await show({ kind: 'data', content }, { deactivateAvailable: true });

      await fireEvent.press(screen.getAllByRole('button', { name: 'Desactivar' })[1]);
      expect(screen.getByText('¿Desactivar a Andrés Mejía?')).toBeOnTheScreen();
      expect(onDeactivate).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole('button', { name: 'Desactivar entrenador' }));
      expect(onDeactivate).toHaveBeenCalledTimes(1);
      expect(onDeactivate).toHaveBeenCalledWith('c2');
      expect(screen.queryByText('¿Desactivar a Andrés Mejía?')).toBeNull();
    });

    it('when available, does not deactivate if the ConfirmSheet is cancelled', async () => {
      const { onDeactivate } = await show({ kind: 'data', content }, { deactivateAvailable: true });

      await fireEvent.press(screen.getAllByRole('button', { name: 'Desactivar' })[0]);
      await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

      expect(onDeactivate).not.toHaveBeenCalled();
    });

    it('names Sin dato in the ConfirmSheet when the name is not readable', async () => {
      const { onDeactivate } = await show(
        { kind: 'data', content: { updatedMinutesAgo: 2, coaches: [{ ...coachesFixture[0]!, name: null, initials: '' }] } },
        { deactivateAvailable: true },
      );

      expect(screen.getByRole('button', { name: 'Desactivar' })).toHaveProp('accessibilityHint', 'Desactivar a Sin dato');
      await fireEvent.press(screen.getByRole('button', { name: 'Desactivar' }));
      expect(screen.getByText('¿Desactivar a Sin dato?')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Desactivar entrenador' }));
      expect(onDeactivate).toHaveBeenCalledWith('c1');
    });
  });

  describe('by width', () => {
    it('compact: a list under the title, with the top navigation', async () => {
      await show({ kind: 'data', content }, { width: 599 });

      expect(screen.queryByTestId('console-nav-side')).toBeNull();
      expect(screen.getByTestId('console-layout-compact')).toBeOnTheScreen();
      expect(screen.getByTestId('console-nav-top', { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.getByText('Paula Gutiérrez')).toBeOnTheScreen();
      expect(screen.getAllByTestId('coach-card')).toHaveLength(3);
    });

    it.each([
      [1024, 'console-nav-side'],
      [800, 'console-nav-top'],
    ])('at %s dp shows %s', async (width, testID) => {
      await show({ kind: 'data', content }, { width });

      expect(screen.getByTestId(testID, { includeHiddenElements: true })).toBeOnTheScreen();
    });
  });

  describe('the grid', () => {
    const cardStyles = () => screen.getAllByTestId('coach-card').map((card) => StyleSheet.flatten(card.props.style));
    const coachesOf = (count: number): CoachesContent => ({
      updatedMinutesAgo: 2,
      coaches: Array.from({ length: count }, (_, index) => ({ ...coachesFixture[0]!, id: `c${index}` })),
    });

    // Jest has no layout engine, so this pins the contract that makes a wrapped row even and at most two wide:
    // the same base for every card, more than a third of the row (three never fit) and at most half (two always do),
    // growth into what is left, and the same numeric minimum width that sends a narrow list to one column.
    it.each([1, 2, 3, 5])('with %i coaches every card has the same two-column base, grows, and has the same minimum width', async (count) => {
      await show({ kind: 'data', content: coachesOf(count) });

      const styles = cardStyles();
      expect(styles).toHaveLength(count);
      for (const style of styles) {
        const share = parseFloat(String(style.flexBasis));
        expect(String(style.flexBasis)).toMatch(/^\d+(\.\d+)?%$/);
        expect(share).toBeGreaterThan(100 / 3);
        expect(share).toBeLessThanOrEqual(50);
        expect(style.flexGrow).toBeGreaterThanOrEqual(1);
        expect(typeof style.minWidth).toBe('number');
        expect(style.flexBasis).toBe(styles[0]!.flexBasis);
        expect(style.minWidth).toBe(styles[0]!.minWidth);
      }
    });

    it('has one full-width column with large text', async () => {
      jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 2 }));
      await show({ kind: 'data', content });

      for (const style of cardStyles()) expect(style.flexBasis).toBe('100%');
    });
  });

  describe('view states', () => {
    it('loading shows the loading state under the title, without the invite', async () => {
      await show({ kind: 'loading' });

      expect(screen.getByRole('header', { name: 'Entrenadores' })).toBeOnTheScreen();
      expect(screen.getByTestId('state-view')).toHaveProp('accessibilityState', { busy: true });
      expect(screen.queryByRole('button', { name: 'Invitar entrenador' })).toBeNull();
    });

    it('empty says who the coaches are and keeps the invite as the only action', async () => {
      await show({ kind: 'empty' });

      expect(screen.getByText('Aún no hay entrenadores')).toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: 'Invitar entrenador' })).toHaveLength(1);
    });

    it('error says what failed and retries', async () => {
      const onRetry = jest.fn();
      await show({ kind: 'error', onRetry });

      expect(screen.getByText('No pudimos cargar los entrenadores')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('offline with stored data shows a dated banner above the coaches', async () => {
      await show({ kind: 'offline', storedOn: storedOnFixture, content });

      expect(screen.getByTestId('banner')).toHaveTextContent(
        'Estás sin conexión Mostramos lo guardado en este dispositivo el 23 de octubre de 2026.',
      );
      expect(screen.getByText('Paula Gutiérrez')).toBeOnTheScreen();
    });

    it('offline without data uses the offline state', async () => {
      await show({ kind: 'offline-empty' });

      expect(screen.getByText('No hay entrenadores guardados en este dispositivo. Aparecerán cuando vuelva la conexión.')).toBeOnTheScreen();
    });

    it('denied says only that it is private, with no data and no invite', async () => {
      await show({ kind: 'denied' });

      expect(screen.getByText('Esta información es privada')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Invitar entrenador' })).toBeNull();
      expect(screen.queryByText('Paula Gutiérrez')).toBeNull();
    });
  });
});
