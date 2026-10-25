import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';

import { CodeMismatchError } from '../../../core/session';
import type { CodeBusy } from '../components/CodeStep';
import type { RegistrationDraft, RegistrationDraftRepository } from '../data/registrationDraft';
import {
  AccountDetailsScreen,
  type AccountDetailsField,
  type AccountDetailsScreenProps,
} from './AccountDetailsScreen';

export type AccountDetailsContainerProps = {
  drafts: RegistrationDraftRepository;
  requestCode: (email: string, options?: { createUser?: boolean }) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  onBack: () => void;
  onSignIn: () => void;
};

type Values = Record<AccountDetailsField, string>;
type Errors = NonNullable<AccountDetailsScreenProps['errors']>;
type Failure = NonNullable<AccountDetailsScreenProps['failure']>;

// Google and Microsoft wait for #84 and #85.
const SHOW_PROVIDERS = false;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate({ firstName, lastName, email }: Values): Errors {
  const errors: Errors = {};
  if (!firstName.trim()) errors.firstName = 'required';
  if (!lastName.trim()) errors.lastName = 'required';
  if (!email.trim()) errors.email = 'required';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'invalid';
  return errors;
}

// Step 2: what is typed is saved to the draft at once (never the code), so a lost signal or a closed app loses nothing.
// Once the code checks out the session gate moves to the app, which stores the profile and clears the draft.
export function AccountDetailsContainer({ drafts, requestCode, verifyCode, onBack, onSignIn }: AccountDetailsContainerProps) {
  const [loaded, setLoaded] = useState<RegistrationDraft | null>();
  const [values, setValues] = useState<Values>({ firstName: '', lastName: '', email: '', code: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<CodeBusy>();
  const [failure, setFailure] = useState<Failure>();
  const lastAction = useRef<'request' | 'verify'>('request');

  useEffect(() => {
    let current = true;
    drafts
      .load()
      .catch(() => null)
      .then((draft) => {
        if (!current) return;
        setValues((typed) => ({ ...typed, firstName: draft?.firstName ?? '', lastName: draft?.lastName ?? '', email: draft?.email ?? '' }));
        setLoaded(draft);
      });
    return () => {
      current = false;
    };
  }, [drafts]);

  function change(field: AccountDetailsField, value: string) {
    const next = { ...values, [field]: value };
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (field !== 'code') {
      drafts.save({ swimmer: loaded?.swimmer, firstName: next.firstName, lastName: next.lastName, email: next.email }).catch(() => {});
    }
    // A code belongs to the email it was sent to.
    if (field === 'email' && codeSent) {
      setCodeSent(false);
      next.code = '';
    }
    setValues(next);
  }

  function failureOf(error: unknown, fallback: Failure): Failure {
    return isAuthRetryableFetchError(error) ? 'offline' : fallback;
  }

  async function request() {
    lastAction.current = 'request';
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setFailure(undefined);
    setBusy('sending');
    try {
      // Registration is the only place that creates accounts.
      await requestCode(values.email.trim(), { createUser: true });
      setCodeSent(true);
    } catch (error) {
      setFailure(failureOf(error, 'request_failed'));
    } finally {
      setBusy(undefined);
    }
  }

  async function verify() {
    lastAction.current = 'verify';
    setFailure(undefined);
    setBusy('verifying');
    try {
      await verifyCode(values.email.trim(), values.code);
    } catch (error) {
      if (error instanceof CodeMismatchError) setErrors({ code: 'mismatch' });
      else setFailure(failureOf(error, 'verify_failed'));
    } finally {
      setBusy(undefined);
    }
  }

  if (loaded === undefined) return null;
  return (
    <AccountDetailsScreen
      step={2}
      total={loaded?.swimmer === 'adult' ? 3 : 4}
      values={values}
      codeSent={codeSent}
      errors={errors}
      busy={busy}
      failure={failure}
      providers={SHOW_PROVIDERS}
      onChange={change}
      onRetry={() => (lastAction.current === 'verify' ? verify() : request())}
      onRequestCode={request}
      onSubmitCode={verify}
      onSignIn={onSignIn}
      onBack={onBack}
    />
  );
}
