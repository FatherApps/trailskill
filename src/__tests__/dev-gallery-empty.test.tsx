import { renderRouter, screen } from 'expo-router/testing-library';

import DevLayout from '../app/(dev)/_layout';
import GalleryEntryScreen from '../app/(dev)/gallery/[id]';

// The timing module index pulls in its PowerSync repository, which needs the native database.
jest.mock('../core/sync', () => jest.requireActual('../core/sync/syncState'));
jest.mock('@powersync/react', () => ({}));
jest.mock('../core/sync/db', () => ({ db: {} }));

// The registry is mocked at module level, so this lives apart from the other gallery tests.
jest.mock('../core/ui', () => {
  const actual = jest.requireActual('../core/ui');
  return { ...actual, galleryEntries: [...actual.galleryEntries, { id: 'empty', title: 'Empty', states: {} }] };
});

describe('development gallery with an entry that has no states', () => {
  it('renders the entry without a preview instead of crashing', async () => {
    await renderRouter(
      { '(dev)/_layout': DevLayout, '(dev)/gallery/[id]': GalleryEntryScreen },
      { initialUrl: '/gallery/empty' },
    );

    expect(screen.getByRole('header', { name: 'Empty' })).toBeOnTheScreen();
    expect(screen.getByTestId('gallery-preview')).toBeEmptyElement();
  });
});
