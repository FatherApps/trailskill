import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button, Tag } from '../../../core/ui';
import type { AnonymousCopy } from '../../athletes';
import '../i18n';
import { authorizationListColors } from './AuthorizationList';
import { formatDate } from './formatDate';

// The anonymous swimmers of the school, or why there are none to show. An empty list is a real answer (the school made no copy); the others are not.
export type AnonymousCopiesState = AnonymousCopy[] | 'loading' | 'offline' | 'error';

export type AnonymousCopyListProps = {
  // Read online only. Offline or failed: the title and a note (with a retry when the read failed), no rows. The caller shows nothing while loading.
  copies: Exclude<AnonymousCopiesState, 'loading'>;
  onRetry: () => void;
};

// The copies a school kept of swimmers that left: no name, no family and never the code. Only an active admin gets rows.
export function AnonymousCopyList({ copies, onRetry }: AnonymousCopyListProps) {
  const { colors, space, radius, typography } = useTheme();
  const title = (
    <Text accessibilityRole="header" style={[typography.label, { color: colors[authorizationListColors.text] }]}>
      {t('schoolConsole.authorizations.anonymous.title')}
    </Text>
  );

  if (!Array.isArray(copies)) {
    return (
      <View testID="anonymous-copies" style={{ gap: space[2], alignItems: 'flex-start' }}>
        {title}
        <Text style={[typography.caption, { color: colors[authorizationListColors.caption] }]}>{t(`schoolConsole.authorizations.anonymous.${copies}`)}</Text>
        {copies === 'error' && <Button variant="ghost" label={t('schoolConsole.screen.retry')} onPress={onRetry} />}
      </View>
    );
  }

  return (
    <View testID="anonymous-copies" style={{ gap: space[2] }}>
      {title}
      <View style={{ borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors[authorizationListColors.background] }}>
        {copies.map((copy, index) => {
          const date = formatDate(copy.createdAt.slice(0, 10), 'short');
          const detail = t('schoolConsole.authorizations.anonymous.times', { count: copy.timesCount });
          return (
            <View
              key={copy.athleteId}
              style={[
                { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[2], padding: space[3] },
                index < copies.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors[authorizationListColors.divider] },
              ]}
            >
              <View style={{ flexShrink: 1, gap: space[1] }}>
                <Text style={[typography['body-strong'], { color: colors[authorizationListColors.text] }]}>{t('schoolConsole.authorizations.anonymous.name')}</Text>
                <Text style={[typography.caption, { color: colors[authorizationListColors.caption] }]}>
                  {/* A malformed date is left out rather than shown wrong. */}
                  {date ? `${detail} · ${date}` : detail}
                </Text>
              </View>
              <Tag
                label={t(`schoolConsole.authorizations.anonymous.${copy.linkable ? 'linkable' : 'not_linkable'}`)}
                variant={copy.linkable ? 'ok' : 'warn'}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}
