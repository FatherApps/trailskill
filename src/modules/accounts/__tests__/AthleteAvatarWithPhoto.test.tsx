import { render, screen } from '@testing-library/react-native';

import { AthleteAvatarWithPhoto } from '../components/AthleteAvatarWithPhoto';

// Synthetic data only. The two answers the avatar needs are faked: show_photo in force, and the local photo of the athlete.
const mockAuthorized = jest.fn();
const mockPhoto = jest.fn();

jest.mock('../data/authorizations', () => ({ useHasValidAuthorization: (...args: unknown[]) => mockAuthorized(...args) }));
jest.mock('../../athletes', () => ({ useAthletePhoto: (...args: unknown[]) => mockPhoto(...args) }));

const props = { athleteId: 'a1', initials: 'LR', color: 'athlete-1', size: 'md' } as const;
const photo = () => screen.queryByTestId('athlete-avatar-photo', { includeHiddenElements: true });

beforeEach(() => {
  mockAuthorized.mockReturnValue(true);
  mockPhoto.mockReturnValue({ status: 'ready', uri: 'file:///synthetic/a1.jpg' });
});

describe('AthleteAvatarWithPhoto', () => {
  it('asks for show_photo of this athlete and gives it to the photo lookup', async () => {
    await render(<AthleteAvatarWithPhoto {...props} />);

    expect(mockAuthorized).toHaveBeenCalledWith('a1', 'show_photo');
    expect(mockPhoto).toHaveBeenCalledWith('a1', true);
  });

  it('shows the photo when show_photo is in force and the photo is on the device', async () => {
    await render(<AthleteAvatarWithPhoto {...props} />);

    expect(photo()?.props.source).toEqual({ uri: 'file:///synthetic/a1.jpg' });
  });

  it('shows the initials without show_photo, whatever the lookup returns', async () => {
    mockAuthorized.mockReturnValue(false);
    await render(<AthleteAvatarWithPhoto {...props} />);

    expect(photo()).toBeNull();
    expect(screen.getByText('LR', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it.each([{ status: 'none', uri: null }, { status: 'loading', uri: null }, { status: 'unavailable', uri: null }])(
    'shows the initials while the photo is $status',
    async (result) => {
      mockPhoto.mockReturnValue(result);
      await render(<AthleteAvatarWithPhoto {...props} />);

      expect(photo()).toBeNull();
      expect(screen.getByText('LR', { includeHiddenElements: true })).toBeOnTheScreen();
    },
  );
});
