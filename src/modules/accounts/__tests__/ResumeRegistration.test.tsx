import { fireEvent, render, screen } from '@testing-library/react-native';

import { ResumeRegistration } from '../components/ResumeRegistration';

const EMAIL = 'camila@example.test';
const RESUME = `Retomar el registro de ${EMAIL}`;

async function renderOffer() {
  const onResume = jest.fn();
  const onRestart = jest.fn();
  await render(<ResumeRegistration email={EMAIL} onResume={onResume} onRestart={onRestart} />);
  return { onResume, onRestart };
}

describe('ResumeRegistration', () => {
  it('offers to resume the registration of the email and to start again', async () => {
    await renderOffer();

    expect(screen.getByRole('button', { name: RESUME })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Empezar de nuevo' })).toBeOnTheScreen();
  });

  it('resumes without asking anything', async () => {
    const { onResume, onRestart } = await renderOffer();
    await fireEvent.press(screen.getByRole('button', { name: RESUME }));

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onRestart).not.toHaveBeenCalled();
  });

  it('asks before deleting the draft and deletes it only on confirmation', async () => {
    const { onResume, onRestart } = await renderOffer();
    await fireEvent.press(screen.getByRole('button', { name: 'Empezar de nuevo' }));

    expect(onRestart).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByRole('button', { name: 'Borrar y empezar de nuevo' }));

    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onResume).not.toHaveBeenCalled();
  });

  it('keeps the draft when the question is dismissed', async () => {
    const { onRestart } = await renderOffer();
    await fireEvent.press(screen.getByRole('button', { name: 'Empezar de nuevo' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Mantener el registro' }));

    expect(onRestart).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Borrar y empezar de nuevo' })).not.toBeOnTheScreen();
  });
});
