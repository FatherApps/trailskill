import { render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { longTextMeasurementFixture, measurementsFixture } from '../__fixtures__/measurements';
import { MeasurementLog } from '../components/MeasurementLog';

const hidden = { includeHiddenElements: true };

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

describe('MeasurementLog', () => {
  it('lists the measurements in the order given, with athlete, event, author, device, date and hour', async () => {
    await render(<MeasurementLog entries={measurementsFixture} />);

    expect(screen.getAllByTestId('measurement-entry')).toHaveLength(4);
    expect(screen.getByLabelText(/^Lucía Ramírez, Libre 50 · Paula G\. · Tablet 2 · 24 oct 2026 · 08:30/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Julián Ortiz, Libre 100 · Andrés M\. · Teléfono 5 · 23 oct 2026 · 17:05/)).toBeOnTheScreen();
    const order = screen.getAllByTestId('measurement-entry').map((entry) => entry.props.accessibilityLabel ?? '');
    expect(order).toHaveLength(4);
    expect(screen.getByText('34,82', hidden)).toBeOnTheScreen();
  });

  it('shows a dash for a measurement without time, never 0,00', async () => {
    await render(<MeasurementLog entries={[measurementsFixture[2]]} />);

    expect(screen.getAllByText('—', hidden)).toHaveLength(1);
    expect(screen.queryByText('0,00', hidden)).toBeNull();
  });

  it('leaves out the date and hour when they cannot be read, instead of showing them wrong', async () => {
    const [entry] = measurementsFixture;
    await render(<MeasurementLog entries={[{ ...entry, versions: [{ ...entry.versions[0], at: 'ayer' }] }]} />);

    expect(screen.getByLabelText(/^Lucía Ramírez, Libre 50 · Paula G\. · Tablet 2/)).toBeOnTheScreen();
    expect(screen.queryByText(/ayer/, hidden)).toBeNull();
  });

  describe('a conflict', () => {
    it('is flagged and shows both versions with author, device, hour and time', async () => {
      await render(<MeasurementLog entries={measurementsFixture} />);

      expect(screen.getAllByText('Revisar', hidden)).toHaveLength(1);
      expect(screen.getByLabelText('Primera versión: 33 segundos con 91 centésimas, Paula G., Tablet 2, 08:12')).toBeOnTheScreen();
      expect(screen.getByLabelText('Segunda versión: 34 segundos con 19 centésimas, Andrés M., Teléfono 5, 08:15')).toBeOnTheScreen();
      expect(screen.getByText('Un administrador de la plataforma decide cuál se conserva.', hidden)).toBeOnTheScreen();
    });

    it('only flags: there is no action to resolve it', async () => {
      await render(<MeasurementLog entries={[measurementsFixture[1]]} />);

      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('does not flag a measurement with a single version', async () => {
      await render(<MeasurementLog entries={[measurementsFixture[0]]} />);

      expect(screen.queryByText('Revisar', hidden)).toBeNull();
      expect(screen.queryByLabelText(/versión/i)).toBeNull();
    });

    it('flags a conflict whose other version this device does not hold, with no box of versions and no action', async () => {
      await render(<MeasurementLog entries={[{ ...measurementsFixture[0], sync: 'needs_review' }]} />);

      expect(screen.getAllByText('Revisar', hidden)).toHaveLength(1);
      expect(screen.getByText('34,82', hidden)).toBeOnTheScreen();
      expect(screen.queryByLabelText(/versión/i)).toBeNull();
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('shows a dash for a version without time', async () => {
      const [first, second] = measurementsFixture[1].versions;
      await render(<MeasurementLog entries={[{ ...measurementsFixture[1], versions: [{ ...first, time: null }, second] }]} />);

      expect(screen.getByLabelText('Primera versión: sin tiempo, Paula G., Tablet 2, 08:12')).toBeOnTheScreen();
      expect(screen.queryByText('0,00', hidden)).toBeNull();
    });
  });

  it('shows the type and the sync state of each record', async () => {
    await render(<MeasurementLog entries={[{ ...measurementsFixture[0], kind: 'Carrera', sync: 'on_device' }]} />);

    expect(screen.getByLabelText(/^Lucía Ramírez, Libre 50 · Carrera · Paula G\. · Tablet 2 · 24 oct 2026 · 08:30/)).toBeOnTheScreen();
    expect(screen.getByText('En el teléfono', hidden)).toBeOnTheScreen();
  });

  it('shows a message inside the frame when no measurement matches', async () => {
    await render(<MeasurementLog entries={[]} />);

    expect(screen.getByTestId('state-view')).toBeOnTheScreen();
    expect(screen.getByText('No hay mediciones con estos filtros')).toBeOnTheScreen();
  });

  it('keeps long names, devices and authors whole', async () => {
    await render(<MeasurementLog entries={[longTextMeasurementFixture]} />);

    expect(screen.getByLabelText(/María Fernanda de los Ángeles Restrepo Villegas, Combinado individual 200/)).toBeOnTheScreen();
    expect(screen.getByText(/Tableta del salón de entrenadores/, hidden)).toBeOnTheScreen();
    expect(screen.getByText(/Teléfono del entrenador de apoyo/, hidden)).toBeOnTheScreen();
  });
});
