import { useState, type ReactElement, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import type { GalleryEntry } from '../../core/ui';
import { accountsFixture as fx } from './__fixtures__/accounts';
import { AccountDetailsScreen, type AccountDetailsScreenProps } from './screens/AccountDetailsScreen';
import { SignInScreen, type SignInScreenProps } from './screens/SignInScreen';
import { WhoSwimsScreen, type WhoSwimsScreenProps } from './screens/WhoSwimsScreen';

const noop = () => {};

// The preview box shrinks its children to their content; screens need the full width.
const FullWidth = ({ children }: { children: ReactNode }) => <View style={{ alignSelf: 'stretch' }}>{children}</View>;

// A real screen height, so a bottom-anchored action shows; it grows with large text so the gallery scroll reaches it.
function FullScreen({ children }: { children: ReactNode }) {
  const { height } = useWindowDimensions();
  return <View style={{ alignSelf: 'stretch', minHeight: height }}>{children}</View>;
}

const person = { name: fx.person.name, email: fx.person.email, phone: fx.person.phone };

// Holds what is typed, so the fields of a state can be edited in the gallery.
function AccountDetailsPreview(props: Partial<AccountDetailsScreenProps>) {
  const [values, setValues] = useState({ name: '', email: '', phone: '', code: '', ...props.values });

  return (
    <FullWidth>
      <AccountDetailsScreen
        step={2}
        total={4}
        onGoogle={noop}
        onMicrosoft={noop}
        onRequestCode={noop}
        onSubmitCode={noop}
        onSignIn={noop}
        onBack={noop}
        {...props}
        values={values}
        onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
      />
    </FullWidth>
  );
}

function SignInPreview(props: Partial<SignInScreenProps>) {
  const [values, setValues] = useState({ email: '', code: '', ...props.values });

  return (
    <FullWidth>
      <SignInScreen
        onGoogle={noop}
        onMicrosoft={noop}
        onRequestCode={noop}
        onSubmitCode={noop}
        onBack={noop}
        {...props}
        values={values}
        onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
      />
    </FullWidth>
  );
}

const whoSwims = (props: Partial<WhoSwimsScreenProps> = {}): ReactElement => (
  <FullScreen>
    <WhoSwimsScreen onSelect={noop} onBack={noop} {...props} />
  </FullScreen>
);

export const galleryEntries: GalleryEntry[] = [
  {
    id: 'whoSwims',
    title: 'WhoSwimsScreen',
    states: {
      initial: () => whoSwims(),
      child: () => whoSwims({ initialChoice: 'child' }),
      adult: () => whoSwims({ initialChoice: 'adult' }),
      invitation: () => whoSwims({ invitation: fx.invitation }),
    },
  },
  {
    id: 'accountDetails',
    title: 'AccountDetailsScreen',
    states: {
      initial: () => <AccountDetailsPreview />,
      codeSent: () => <AccountDetailsPreview values={{ ...person, code: '' }} codeSent />,
      codeMismatch: () => (
        <AccountDetailsPreview values={{ ...person, code: fx.wrongCode }} codeSent errors={{ code: 'mismatch' }} />
      ),
      emailInUse: () => <AccountDetailsPreview values={{ ...person, code: '' }} errors={{ email: 'in_use' }} />,
      offline: () => <AccountDetailsPreview values={{ ...person, code: '' }} codeSent offline />,
      sending: () => <AccountDetailsPreview values={{ ...person, code: '' }} busy="sending" />,
      invitation: () => <AccountDetailsPreview values={{ ...person, code: '' }} invitation={fx.invitation} />,
    },
  },
  {
    id: 'signIn',
    title: 'SignInScreen',
    states: {
      initial: () => <SignInPreview />,
      codeSent: () => <SignInPreview values={{ email: fx.person.email, code: '' }} codeSent />,
      codeMismatch: () => (
        <SignInPreview
          values={{ email: fx.person.email, code: fx.wrongCode }}
          codeSent
          errors={{ code: 'mismatch' }}
        />
      ),
      sending: () => <SignInPreview values={{ email: fx.person.email, code: '' }} busy="sending" />,
      offline: () => <SignInPreview values={{ email: fx.person.email, code: '' }} codeSent offline />,
    },
  },
];
