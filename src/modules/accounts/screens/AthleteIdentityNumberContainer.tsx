import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button, StateView, TextField } from '../../../core/ui';
import {
  IDENTITY_NUMBER_MAX_LENGTH,
  isValidIdentityNumber,
  normalizeIdentityNumber,
  type IdentityDocumentRepository,
  type IdentityNumberHint,
} from '../data/identityDocuments';
import '../i18n';

export type AthleteIdentityNumberContainerProps = {
  athleteId: string;
  repository: Pick<IdentityDocumentRepository, 'save' | 'hint'>;
  // import_official_results in force for this swimmer, decided by the route.
  authorized: boolean;
  // Saving and reading the hint need signal.
  online: boolean;
  onGoToAuthorizations: () => void;
};

type Loaded = { key: string; result: { status: 'ready'; hint: IdentityNumberHint } | { status: 'error' } };

// "Número de identificación" on the Editar screen: shows how the saved number ends and, with the authorization and signal, replaces it. The full number never comes back to the app.
export function AthleteIdentityNumberContainer({ athleteId, repository, authorized, online, onGoToAuthorizations }: AthleteIdentityNumberContainerProps) {
  const { colors, space, radius, typography } = useTheme();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>();
  const [number, setNumber] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const requestKey = `${athleteId}|${attempt}`;
  useEffect(() => {
    if (!online) return;
    let current = true;
    repository.hint(athleteId).then(
      (hint) => current && setLoaded({ key: requestKey, result: { status: 'ready', hint } }),
      // Not knowing whether a number is saved is a load error, not a form: offering to type one blindly could replace it.
      () => current && setLoaded({ key: requestKey, result: { status: 'error' } }),
    );
    return () => {
      current = false;
    };
  }, [online, repository, athleteId, requestKey]);

  async function save() {
    if (saving) return;
    const identityNumber = normalizeIdentityNumber(number);
    if (!isValidIdentityNumber(identityNumber)) return setInvalid(true);
    setSaving(true);
    try {
      await repository.save({ athleteId, identityNumber });
    } catch {
      // The message is fixed on purpose: nothing of the error, which may carry the number, is shown or logged.
      setSaveFailed(true);
      return;
    } finally {
      setSaving(false);
    }
    // Saved: the screen does not keep it any longer.
    setNumber('');
    setSaveFailed(false);
    setAttempt((n) => n + 1);
  }

  const muted = [typography.caption, { color: colors['ink-muted'] }];
  const hintResult = loaded?.key === requestKey ? loaded.result : undefined;

  let body;
  if (!online) body = <Text style={muted}>{t('accounts.identity_number.offline')}</Text>;
  else if (!hintResult) body = <StateView kind="loading" />;
  else if (hintResult.status === 'error')
    body = (
      <StateView
        kind="error"
        title={t('accounts.identity_number.error_title')}
        message={t('accounts.identity_number.error_message')}
        action={{ label: t('accounts.identity_number.retry'), onPress: () => setAttempt((n) => n + 1) }}
      />
    );
  else {
    const { present, lastThree } = hintResult.hint;
    const hintText = !present
      ? t('accounts.identity_number.none')
      : lastThree
        ? t('accounts.identity_number.saved_ending', { ending: lastThree })
        : t('accounts.identity_number.saved');
    body = (
      <View style={{ gap: space[3] }}>
        <Text style={[typography.body, { color: colors.ink }]}>{hintText}</Text>
        {authorized ? (
          <>
            <TextField
              label={t('accounts.identity_number.new_label')}
              help={t('accounts.identity_number.help')}
              error={invalid ? t('accounts.identity_number.invalid') : undefined}
              value={number}
              onChangeText={(text) => {
                setNumber(text);
                setInvalid(false);
                setSaveFailed(false);
              }}
              maxLength={IDENTITY_NUMBER_MAX_LENGTH + 6}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {saveFailed && <Text style={[typography.caption, { color: colors['danger-text'] }]}>{t('accounts.identity_number.save_failed')}</Text>}
            <Button label={t('accounts.identity_number.save')} loading={saving} onPress={() => void save()} />
          </>
        ) : (
          <>
            <Text style={muted}>{t('accounts.identity_number.unauthorized')}</Text>
            <Button variant="secondary" label={t('accounts.identity_number.go_to_authorizations')} onPress={onGoToAuthorizations} />
          </>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: space[2], padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'], borderWidth: 1, borderColor: colors.border }}>
      <Text accessibilityRole="header" style={[typography['body-strong'], { color: colors.ink }]}>
        {t('accounts.identity_number.title')}
      </Text>
      {body}
    </View>
  );
}
