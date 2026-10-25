import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { schoolNameFixture, storedOnFixture } from '../__fixtures__/athletes';
import { authorizationsFixture, longTextAuthorizationFixture, sharingRequestsFixture } from '../__fixtures__/authorizations';
import {
  AuthorizationsScreen,
  type AuthorizationsContent,
  type AuthorizationsScreenProps,
  type AuthorizationsView,
} from '../screens/AuthorizationsScreen';

const content: AuthorizationsContent = {
  updatedMinutesAgo: 2,
  athletes: authorizationsFixture,
  sharingRequests: sharingRequestsFixture,
};
const hidden = { includeHiddenElements: true };

const show = async (view: AuthorizationsView, extra: Partial<AuthorizationsScreenProps> = {}) => {
  const actions = { onNavigate: jest.fn(), onResend: jest.fn(), onApproveSharing: jest.fn() };
  await render(<AuthorizationsScreen width={1280} schoolName={schoolNameFixture} view={view} {...actions} {...extra} />);
  return actions;
};

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

describe('AuthorizationsScreen', () => {
  describe('with data', () => {
    it('shows the title, the caption with the pending ones and every athlete with the guardian, in the authorizations section', async () => {
      await show({ kind: 'data', content });

      expect(screen.getByRole('header', { name: 'Autorizaciones' })).toBeOnTheScreen();
      expect(screen.getByText('4 deportistas · 2 con solicitudes pendientes · Actualizado hace 2 min')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Autorizaciones' })).toBeSelected();
      expect(screen.getByLabelText('Lucía Ramírez, Acudiente: Paula Gómez')).toBeOnTheScreen();
      expect(screen.getByLabelText('Sara Peña, Acudiente: Camilo Peña')).toBeOnTheScreen();
    });

    it('shows the status of each purpose of each athlete, in words and not only in colour', async () => {
      await show({ kind: 'data', content });

      // Lucía: recording valid, import valid, sharing pending. Mateo: recording valid, import withdrawn, sharing valid.
      expect(screen.getAllByLabelText('Registrar tiempos y resultados: Vigente')).toHaveLength(3);
      expect(screen.getAllByLabelText('Compartir resultados con otra escuela: Pendiente')).toHaveLength(2);
      expect(screen.getAllByLabelText('Importar resultados oficiales: Retirada')).toHaveLength(1);
    });

    it('offers to re-send only for the pending purposes', async () => {
      await show({ kind: 'data', content });

      // Lucía's sharing, and Sara's three.
      expect(screen.getAllByRole('button', { name: 'Reenviar solicitud' })).toHaveLength(4);
    });

    it('re-sends only after the ConfirmSheet names the guardian and the purpose and is confirmed', async () => {
      const { onResend } = await show({ kind: 'data', content });

      await fireEvent.press(screen.getAllByRole('button', { name: 'Reenviar solicitud' })[0]);
      expect(screen.getByText('¿Reenviar la solicitud?')).toBeOnTheScreen();
      expect(
        screen.getByText(
          'Se enviará de nuevo a Paula Gómez la solicitud de autorización «Compartir resultados con otra escuela» de Lucía Ramírez.',
        ),
      ).toBeOnTheScreen();
      expect(onResend).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole('button', { name: 'Reenviar al acudiente' }));
      expect(onResend).toHaveBeenCalledTimes(1);
      expect(onResend).toHaveBeenCalledWith('a1', 'share');
      expect(screen.queryByText('¿Reenviar la solicitud?')).toBeNull();
    });

    it('does not re-send when the ConfirmSheet is cancelled', async () => {
      const { onResend } = await show({ kind: 'data', content });

      await fireEvent.press(screen.getAllByRole('button', { name: 'Reenviar solicitud' })[1]);
      await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

      expect(onResend).not.toHaveBeenCalled();
      expect(screen.queryByText('¿Reenviar la solicitud?')).toBeNull();
    });

    it('lists the requests of other schools and approves one only after the ConfirmSheet is confirmed', async () => {
      const { onApproveSharing } = await show({ kind: 'data', content });

      expect(screen.getByText('Solicitudes de otras escuelas')).toBeOnTheScreen();
      expect(screen.getByText('Escuela Tiburones')).toBeOnTheScreen();
      expect(screen.getByText('Pidió ver los resultados de tu escuela · 22 oct 2026')).toBeOnTheScreen();

      await fireEvent.press(screen.getAllByRole('button', { name: 'Aprobar' })[0]);
      expect(screen.getByText('¿Aprobar que Escuela Tiburones vea los resultados de tu escuela?')).toBeOnTheScreen();
      expect(onApproveSharing).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole('button', { name: 'Aprobar acceso' }));
      expect(onApproveSharing).toHaveBeenCalledTimes(1);
      expect(onApproveSharing).toHaveBeenCalledWith('s1');
    });

    it('does not approve when the ConfirmSheet is cancelled', async () => {
      const { onApproveSharing } = await show({ kind: 'data', content });

      await fireEvent.press(screen.getAllByRole('button', { name: 'Aprobar' })[1]);
      await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

      expect(onApproveSharing).not.toHaveBeenCalled();
    });

    it('leaves out the requests section when no school asked', async () => {
      await show({ kind: 'data', content: { ...content, sharingRequests: [] } });

      expect(screen.queryByText('Solicitudes de otras escuelas')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
    });

    it('shows an unknown guardian as "Sin dato" and says so in the ConfirmSheet', async () => {
      await show({ kind: 'data', content: { ...content, athletes: [{ ...authorizationsFixture[0], guardian: null }] } });

      expect(screen.getByLabelText('Lucía Ramírez, Acudiente: Sin dato')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Reenviar solicitud' }));
      expect(
        screen.getByText(
          'Se creará una invitación nueva para que el acudiente de Lucía Ramírez responda la solicitud «Compartir resultados con otra escuela». La compartes en el siguiente paso.',
        ),
      ).toBeOnTheScreen();
    });

    it('offers no re-send for an athlete that cannot be re-sent', async () => {
      await show({ kind: 'data', content: { ...content, athletes: [{ ...authorizationsFixture[0], canResend: false }] } });

      expect(screen.queryByRole('button', { name: 'Reenviar solicitud' })).toBeNull();
    });

    it('shows the requests title with a note, and no approval, when approving is not available yet', async () => {
      await show({ kind: 'data', content: { ...content, sharingRequests: null } });

      expect(screen.getByText('Solicitudes de otras escuelas')).toBeOnTheScreen();
      expect(screen.getByText('Aprobar que otra escuela vea tus resultados estará disponible más adelante.')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
    });

    it('passes the navigation to the caller', async () => {
      const { onNavigate } = await show({ kind: 'data', content });

      await fireEvent.press(screen.getByRole('tab', { name: 'Deportistas' }));

      expect(onNavigate).toHaveBeenCalledWith('athletes');
    });

    it('keeps long names and school names whole', async () => {
      await show({ kind: 'data', content: { ...content, athletes: [longTextAuthorizationFixture] } });

      expect(screen.getByText('María Fernanda de los Ángeles Restrepo Villegas', hidden)).toBeOnTheScreen();
      expect(screen.getByText('Club Náutico Olas de la Costa Atlántica')).toBeOnTheScreen();
    });
  });

  describe('by width', () => {
    it('expanded: side navigation', async () => {
      await show({ kind: 'data', content }, { width: 1280 });

      expect(screen.getByTestId('console-nav-side')).toBeOnTheScreen();
    });

    it('medium: navigation on top', async () => {
      await show({ kind: 'data', content }, { width: 800 });

      expect(screen.getByTestId('console-nav-top', hidden)).toBeOnTheScreen();
    });

    it('compact: the top navigation and the same actions', async () => {
      await show({ kind: 'data', content }, { width: 599 });

      expect(screen.queryByTestId('console-nav-side')).toBeNull();
      expect(screen.getByTestId('console-layout-compact')).toBeOnTheScreen();
      expect(screen.getByTestId('console-nav-top', hidden)).toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: 'Reenviar solicitud' })).toHaveLength(4);
      expect(screen.getAllByRole('button', { name: 'Aprobar' })).toHaveLength(2);
    });
  });

  describe('view states', () => {
    it('loading shows the loading state under the title', async () => {
      await show({ kind: 'loading' });

      expect(screen.getByRole('header', { name: 'Autorizaciones' })).toBeOnTheScreen();
      expect(screen.getByTestId('state-view')).toHaveProp('accessibilityState', { busy: true });
    });

    it('empty says what will appear and who creates it', async () => {
      await show({ kind: 'empty' });

      expect(screen.getByText('Aún no hay autorizaciones')).toBeOnTheScreen();
      expect(screen.getByText('Aparecen cuando un acudiente crea la cuenta de un deportista y responde la solicitud.')).toBeOnTheScreen();
    });

    it('error says what failed and retries', async () => {
      const onRetry = jest.fn();
      await show({ kind: 'error', onRetry });

      expect(screen.getByText('No pudimos cargar las autorizaciones')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('offline with stored data shows a dated banner above the list', async () => {
      await show({ kind: 'offline', storedOn: storedOnFixture, content });

      expect(screen.getByTestId('banner')).toHaveTextContent(
        'Estás sin conexión Mostramos lo guardado en este dispositivo el 23 de octubre de 2026.',
      );
      expect(screen.getByLabelText('Lucía Ramírez, Acudiente: Paula Gómez')).toBeOnTheScreen();
    });

    it('offline without data uses the offline state', async () => {
      await show({ kind: 'offline-empty' });

      expect(screen.getByText('No hay autorizaciones guardadas en este dispositivo. Aparecerán cuando vuelva la conexión.')).toBeOnTheScreen();
    });

    it('denied says only that it is private, with no data and no actions', async () => {
      await show({ kind: 'denied' });

      expect(screen.getByText('Esta información es privada')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Reenviar solicitud' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
    });
  });
});
