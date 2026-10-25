import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { RecordSyncState } from '../syncState';
import { RecordSyncStatus } from '../RecordSyncStatus';
import { retryFailedRecord } from '../writes';
import { useRecordSyncState } from '../syncState';

// The real modules load PowerSync, which needs a native runtime.
jest.mock('../syncState', () => ({ useRecordSyncState: jest.fn() }));
jest.mock('../writes', () => ({ retryFailedRecord: jest.fn() }));

const setState = (state: RecordSyncState) => (useRecordSyncState as jest.Mock).mockReturnValue(state);

beforeEach(() => {
  jest.clearAllMocks();
  (retryFailedRecord as jest.Mock).mockResolvedValue(undefined);
});

describe('RecordSyncStatus', () => {
  it('reads the state of its record and retries it from the "No enviado" button', async () => {
    setState('not_sent');
    await render(<RecordSyncStatus table="athletes" id="a-1" />);

    expect(useRecordSyncState).toHaveBeenCalledWith('athletes', 'a-1');
    expect(screen.getByRole('text', { name: 'No enviado' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(retryFailedRecord).toHaveBeenCalledWith('athletes', 'a-1');
  });

  it('follows the record from "No enviado" to "En el teléfono" and then "Enviado"', async () => {
    setState('not_sent');
    await render(<RecordSyncStatus table="athletes" id="a-1" />);
    expect(screen.getByRole('text', { name: 'No enviado' })).toBeOnTheScreen();

    setState('on_device');
    await screen.rerender(<RecordSyncStatus table="athletes" id="a-1" />);
    expect(screen.getByRole('text', { name: 'En el teléfono' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Intentar de nuevo' })).toBeNull();

    setState('synced');
    await screen.rerender(<RecordSyncStatus table="athletes" id="a-1" />);
    expect(screen.getByRole('text', { name: 'Enviado' })).toBeOnTheScreen();
  });

  it('logs a rejected retry without row data and does not throw', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (retryFailedRecord as jest.Mock).mockRejectedValue(new Error('disk full'));
    setState('not_sent');
    await render(<RecordSyncStatus table="athletes" id="a-1" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    await waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(error).toHaveBeenCalledWith('Retrying a failed record did not work', expect.any(Error));
    error.mockRestore();
  });
});
