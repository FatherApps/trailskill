import type { ReactElement } from 'react';
import { View } from 'react-native';

import { space } from '../theme';
import { buttonFixture as b } from './__fixtures__/button';
import { Button } from './Button';

// One component or screen in the development gallery: each state renders it with synthetic props.
export type GalleryEntry = {
  id: string;
  title: string;
  states: Record<string, () => ReactElement>;
};

const noop = () => {};

export const galleryEntries: GalleryEntry[] = [
  {
    id: 'button',
    title: 'Button',
    states: {
      primary: () => <Button label={b.save} accessibilityHint={b.saveHint} onPress={noop} />,
      dark: () => <Button variant="dark" label={b.continue} onPress={noop} />,
      secondary: () => <Button variant="secondary" label={b.addSwimmer} onPress={noop} />,
      stop: () => <Button variant="stop" label={b.stop} onPress={noop} />,
      ghost: () => <Button variant="ghost" label={b.history} onPress={noop} />,
      loading: () => <Button label={b.save} loading loadingLabel={b.saving} onPress={noop} />,
      unavailable: () => <Button label={b.authorize} disabledReason={b.guardianOnly} onPress={noop} />,
      timing: () => (
        <View style={{ flexDirection: 'row', gap: space[2], alignSelf: 'stretch' }}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" size="timing" label={b.split} onPress={noop} />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button variant="stop" size="timing" label={b.stop} onPress={noop} />
          </View>
        </View>
      ),
    },
  },
];
