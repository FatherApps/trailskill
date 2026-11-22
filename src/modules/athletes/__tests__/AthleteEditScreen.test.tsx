import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeProvider } from '../../../core/theme';
import { AthleteEditScreen, type AthleteEditScreenProps } from '..';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const show = (props: Partial<AthleteEditScreenProps> = {}) =>
  render(
    <ThemeProvider>
      <AthleteEditScreen
        athleteId="a1"
        firstName="Ana"
        lastName="Marin"
        onBack={jest.fn()}
        onDone={jest.fn()}
        photo={<Text>Foto del deportista</Text>}
        name={<Text>Nombre y apellido editables</Text>}
        shareCode={<Text>Código para compartir tiempos</Text>}
        {...props}
      />
    </ThemeProvider>,
  );

describe('AthleteEditScreen', () => {
  it('titles the screen with the swimmer and shows the photo, the editable name and the share code in order', async () => {
    await show();

    expect(screen.getByRole('header', { name: 'Editar a Ana Marin' })).toBeOnTheScreen();
    const texts = screen.getAllByText(/^(Foto del deportista|Datos del nadador|Código para compartir tiempos)$/).map((node) => node.props.children);
    expect(texts).toEqual(['Foto del deportista', 'Datos del nadador', 'Código para compartir tiempos']);
    expect(screen.getByText('Nombre y apellido editables')).toBeOnTheScreen();
    expect(screen.queryByText('Por ahora el nombre no se puede cambiar desde la app.')).toBeNull();
  });

  it('puts the identity slot inside the data and the health slot between it and the share code', async () => {
    await show({ identity: <Text>Documento</Text>, health: <Text>Salud y emergencias</Text> });

    const order = screen.getAllByText(/^(Datos del nadador|Documento|Salud y emergencias|Código para compartir tiempos)$/).map((node) => node.props.children);
    expect(order).toEqual(['Datos del nadador', 'Documento', 'Salud y emergencias', 'Código para compartir tiempos']);
  });

  it('puts the birth date and gender slot inside the data, after the name and before the identity', async () => {
    await show({ privateDetails: <Text>Nacimiento y género</Text>, identity: <Text>Documento</Text> });

    const order = screen.getAllByText(/^(Datos del nadador|Nombre y apellido editables|Nacimiento y género|Documento)$/).map((node) => node.props.children);
    expect(order).toEqual(['Datos del nadador', 'Nombre y apellido editables', 'Nacimiento y género', 'Documento']);
  });

  it('shows nothing for the identity and health slots when they are empty', async () => {
    await show();

    expect(screen.queryByText('Documento')).toBeNull();
    expect(screen.queryByText('Salud y emergencias')).toBeNull();
  });

  it('goes back with the round back button and with Listo', async () => {
    const onBack = jest.fn();
    const onDone = jest.fn();
    await show({ onBack, onDone });

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
