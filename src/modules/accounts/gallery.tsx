import { useState, type ReactElement, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { SyncStatus, type GalleryEntry } from '../../core/ui';
import { accountsFixture as fx } from './__fixtures__/accounts';
import { AccountDetailsScreen, type AccountDetailsScreenProps } from './screens/AccountDetailsScreen';
import { AddAthletesScreen, type AddAthletesScreenProps } from './screens/AddAthletesScreen';
import { SignInScreen, type SignInScreenProps } from './screens/SignInScreen';
import { AuthorizationsScreen } from './screens/AuthorizationsScreen';
import { ConsentCard } from './components/ConsentCard';
import { ResumeRegistration } from './components/ResumeRegistration';
import type { AuthorizationRecord, AuthorizationText } from './data/authorizations';
import { WhoSwimsScreen, type WhoSwimsScreenProps } from './screens/WhoSwimsScreen';

const noop = () => {};

// The preview box shrinks its children to their content; screens need the full width.
const FullWidth = ({ children }: { children: ReactNode }) => <View style={{ alignSelf: 'stretch' }}>{children}</View>;

// A real screen height, so a bottom-anchored action shows; it grows with large text so the gallery scroll reaches it.
function FullScreen({ children }: { children: ReactNode }) {
  const { height } = useWindowDimensions();
  return <View style={{ alignSelf: 'stretch', minHeight: height }}>{children}</View>;
}

const person = { firstName: fx.person.firstName, lastName: fx.person.lastName, email: fx.person.email };

// Holds what is typed, so the name fields can be edited in the gallery.
function AddAthletesPreview(props: Partial<AddAthletesScreenProps>) {
  const [values, setValues] = useState({ firstName: '', lastName: '', ...props.values });
  const [categoryId, setCategoryId] = useState('');

  return (
    <FullWidth>
      <AddAthletesScreen
        step={3}
        total={4}
        athletes={[]}
        onAdd={noop}
        onContinue={noop}
        onBack={noop}
        {...props}
        values={values}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
      />
    </FullWidth>
  );
}

// Holds what is typed, so the fields of a state can be edited in the gallery.
function AccountDetailsPreview(props: Partial<AccountDetailsScreenProps>) {
  const [values, setValues] = useState({ firstName: '', lastName: '', email: '', code: '', ...props.values });

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

// Synthetic text and acceptance for the consent card states.
const consentText: AuthorizationText = { id: 'gallery-text', purpose: 'record_times', version: 1, body: 'Texto sintético de ejemplo, no es un texto legal.' };
const consentAccepted: AuthorizationRecord = {
  id: 'gallery-authorization',
  userId: 'gallery-user',
  athleteId: 'gallery-athlete',
  purpose: 'record_times',
  textId: consentText.id,
  textVersion: 1,
  textBody: consentText.body,
  acceptedAt: '2026-10-25T12:00:00.000Z',
  withdrawnAt: null,
};

// Synthetic texts of the three purposes; the authorizations screen lists them for each athlete.
const authorizationTexts: AuthorizationText[] = [
  consentText,
  { id: 'gallery-text-results', purpose: 'import_official_results', version: 1, body: 'Texto sintético de ejemplo, no es un texto legal.' },
  { id: 'gallery-text-school', purpose: 'share_results_with_school', version: 1, body: 'Texto sintético de ejemplo, no es un texto legal.' },
];

export const galleryEntries: GalleryEntry[] = [
  {
    id: 'whoSwims',
    title: 'WhoSwimsScreen',
    states: {
      initial: () => whoSwims(),
      child: () => whoSwims({ initialChoice: 'child' }),
      adult: () => whoSwims({ initialChoice: 'adult' }),
      invitation: () => whoSwims({ invitation: fx.invitation }),
      invalidInvitation: () => whoSwims({ invalidInvitation: true }),
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
      required: () => (
        <AccountDetailsPreview errors={{ firstName: 'required', lastName: 'required', email: 'required' }} />
      ),
      noSignal: () => <AccountDetailsPreview values={{ ...person, code: '' }} failure="offline" onRetry={noop} />,
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
  {
    id: 'authorizations',
    title: 'AuthorizationsScreen',
    states: {
      // Lucía has record_times in force; Tomás does not, so his card shows the skipped tag.
      initial: () => (
        <FullWidth>
          <AuthorizationsScreen
            mode="registration"
            step={{ current: 4, total: 4 }}
            athletes={[
              { id: 'gallery-athlete', name: 'Lucía R.' },
              { id: 'gallery-athlete-2', name: 'Tomás P.' },
            ]}
            texts={authorizationTexts}
            inForce={{ 'gallery-athlete': { record_times: consentAccepted } }}
            failed={false}
            onSave={async () => true}
            onWithdraw={noop}
            onBack={noop}
          />
        </FullWidth>
      ),
    },
  },
  {
    id: 'consentCard',
    title: 'ConsentCard',
    states: {
      unchecked: () => (
        <FullWidth>
          <ConsentCard text={consentText} checked={false} onToggle={noop} onWithdraw={noop} />
        </FullWidth>
      ),
      accepted: () => (
        <FullWidth>
          <ConsentCard text={consentText} accepted={consentAccepted} checked={false} onToggle={noop} onWithdraw={noop} />
        </FullWidth>
      ),
    },
  },
  {
    id: 'addAthletes',
    title: 'AddAthletesScreen',
    states: {
      // Two profiles already added, both still on the phone (not yet sent), and empty name fields.
      withData: () => (
        <AddAthletesPreview
          athletes={[...fx.addedAthletes]}
          renderStatus={() => <SyncStatus state="on_device" />}
        />
      ),
      // The school invitation brings categories: choosing one is optional.
      withCategories: () => <AddAthletesPreview athletes={[...fx.addedAthletes]} categories={[...fx.categories]} />,
    },
  },
  {
    id: 'resumeRegistration',
    title: 'ResumeRegistration',
    states: {
      initial: () => (
        <FullWidth>
          <ResumeRegistration email={fx.person.email} onResume={noop} onRestart={noop} />
        </FullWidth>
      ),
    },
  },
];
