import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import {
  AthleteEditScreen,
  createInMemoryAthleteRelinkRepository,
  RelinkRequestContainer,
  type AthleteRelinkRepository,
  type InMemoryRelinkWorld,
} from '..';

// Synthetic data only. The key is made up.
jest.mock('../../../core/sync', () => ({ supabase: {}, db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const KEY = 'AAAA-BBBB-CCCC-DDDD-EEEE';
const MAIN_CODE = 'TR-AAAA-BBBB-CCCC-DDDD';
const RECOVERY_CODE = 'RC-EEEE-FFFF-GGGG-HHHH';

const world = (): InMemoryRelinkWorld => ({
  markers: [{ key: KEY, codes: [MAIN_CODE, RECOVERY_CODE], schools: [{ schoolId: 's1', schoolName: 'Escuela Norte', times: 3 }] }],
  managed: [{ athleteId: 'a1', firstName: 'Ana', lastName: 'Marin' }],
  adminSchoolIds: ['s1'],
});

async function setup(repository: AthleteRelinkRepository = createInMemoryAthleteRelinkRepository(world())) {
  const onBack = jest.fn();
  await render(
    <ThemeProvider>
      <RelinkRequestContainer athleteId="a1" athleteName="Ana M." repository={repository} onBack={onBack} />
    </ThemeProvider>,
  );
  return { repository, onBack };
}

const field = () => screen.getByLabelText('Clave o código del deportista anterior');
const submit = () => screen.getByRole('button', { name: /^Pedir los tiempos/ });
const type = async (value: string) => fireEvent.changeText(field(), value);

describe('RelinkRequestContainer', () => {
  it('starts with an empty key, a disabled button and no requests', async () => {
    await setup();

    expect(field().props.value).toBe('');
    expect(submit().props.accessibilityState?.disabled).toBe(true);
    expect(await screen.findByText('Aún no has pedido tiempos.')).toBeOnTheScreen();
  });

  it('sends the typed key, clears it, says it was requested and lists the pending request', async () => {
    const { repository } = await setup();
    const request = jest.spyOn(repository, 'request');

    await type(KEY);
    await act(async () => fireEvent.press(submit()));

    expect(request).toHaveBeenCalledWith('a1', KEY);
    expect(await screen.findByText('Listo: pedimos los tiempos a la escuela. Aquí verás qué responde.')).toBeOnTheScreen();
    expect(field().props.value).toBe('');
    expect(await screen.findByText('Escuela Norte')).toBeOnTheScreen();
    expect(screen.getByLabelText('Pendiente')).toBeOnTheScreen();
  });

  it('sends a recovery code typed by hand, a used one is not recognized again, and the screen never offers a saved code', async () => {
    const { repository } = await setup();
    const request = jest.spyOn(repository, 'request');

    expect(field().props.value).toBe('');
    await type(RECOVERY_CODE);
    await act(async () => fireEvent.press(submit()));

    expect(request).toHaveBeenCalledWith('a1', RECOVERY_CODE);
    expect(await screen.findByText('Listo: pedimos los tiempos a la escuela. Aquí verás qué responde.')).toBeOnTheScreen();
    expect(await screen.findByText('Escuela Norte')).toBeOnTheScreen();

    await type(RECOVERY_CODE);
    await act(async () => fireEvent.press(submit()));
    expect(await screen.findByText('No reconocemos esa clave o ese código. Revísalo e inténtalo de nuevo.')).toBeOnTheScreen();
    // The permanent code is not spent by asking.
    await type(MAIN_CODE);
    await act(async () => fireEvent.press(submit()));
    expect(await screen.findByText('Ya habías pedido estos tiempos. Esperamos la respuesta de la escuela.')).toBeOnTheScreen();
  });

  it('says a wrong key is not recognized and creates no request', async () => {
    await setup();

    await type('FFFF-FFFF-FFFF-FFFF-FFFF');
    await act(async () => fireEvent.press(submit()));

    expect(await screen.findByText('No reconocemos esa clave o ese código. Revísalo e inténtalo de nuevo.')).toBeOnTheScreen();
    expect(screen.queryByText('Escuela Norte')).toBeNull();
  });

  it('says so when the limit of attempts is passed', async () => {
    await setup();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await type('FFFF-FFFF-FFFF-FFFF-FFFF');
      await act(async () => fireEvent.press(submit()));
    }
    await type(KEY);
    await act(async () => fireEvent.press(submit()));

    expect(await screen.findByText('Hiciste demasiados intentos. Espera un rato (hasta 24 horas) e inténtalo de nuevo.')).toBeOnTheScreen();
  });

  it('shows a connection error and keeps working after it', async () => {
    const repository = createInMemoryAthleteRelinkRepository(world());
    jest.spyOn(repository, 'request').mockRejectedValueOnce(new Error('Failed to fetch'));
    await setup(repository);

    await type(KEY);
    await act(async () => fireEvent.press(submit()));

    expect(await screen.findByText('No pudimos enviar la solicitud. Revisa tu conexión e inténtalo de nuevo.')).toBeOnTheScreen();
  });

  it('offers to read the requests again when they cannot be read', async () => {
    const repository = createInMemoryAthleteRelinkRepository(world());
    jest.spyOn(repository, 'listForAthlete').mockRejectedValueOnce(new Error('offline'));
    await setup(repository);

    expect(await screen.findByText('No pudimos leer tus solicitudes. Revisa tu conexión.')).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Reintentar' })));

    expect(await screen.findByText('Aún no has pedido tiempos.')).toBeOnTheScreen();
  });

  it('goes back', async () => {
    const { onBack } = await setup();

    fireEvent.press(screen.getByLabelText('Volver'));

    expect(onBack).toHaveBeenCalled();
  });
});

describe('the relink entry of the edit screen', () => {
  const show = (onRelink?: () => void) =>
    render(
      <ThemeProvider>
        <AthleteEditScreen athleteId="a1" firstName="Ana" lastName="Marin" onBack={jest.fn()} onDone={jest.fn()} name={null} onRelink={onRelink} />
      </ThemeProvider>,
    );

  it('opens the request from its button', async () => {
    const onRelink = jest.fn();
    await show(onRelink);

    fireEvent.press(screen.getByRole('button', { name: 'Recuperar tiempos' }));

    expect(onRelink).toHaveBeenCalled();
  });

  it('is not shown when the route does not offer it', async () => {
    await show();

    expect(screen.queryByText('Tiempos de una escuela anterior')).toBeNull();
  });
});
