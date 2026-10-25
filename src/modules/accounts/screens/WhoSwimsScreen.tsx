import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Banner, Button, Icon, StepHeader } from '../../../core/ui';
import { ChoiceRow } from '../components/ChoiceRow';
import { InvitationBanner, type Invitation } from '../components/notices';
import { ScreenFrame } from '../components/ScreenFrame';
import { t } from '../i18n';

export type SwimmerChoice = 'child' | 'adult';

export type WhoSwimsScreenProps = {
  // Already chosen when the screen opens.
  initialChoice?: SwimmerChoice;
  // Present when a school invited the person: shows who invited and the group.
  invitation?: Invitation;
  onSelect: (choice: SwimmerChoice) => void;
  // Goes back to the welcome screen.
  onBack: () => void;
};

const styles = StyleSheet.create({
  list: { overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth },
  error: { flexDirection: 'row', alignItems: 'flex-start' },
  errorText: { flexShrink: 1 },
});

// Step 1 of registration. A guardian goes through four steps, an adult through three (no athlete details).
export function WhoSwimsScreen({ initialChoice, invitation, onSelect, onBack }: WhoSwimsScreenProps) {
  const { colors, space, radius, typography } = useTheme();
  const [choice, setChoice] = useState(initialChoice);
  const [missing, setMissing] = useState(false);

  function choose(next: SwimmerChoice) {
    setChoice(next);
    setMissing(false);
  }

  function next() {
    if (choice === undefined) {
      setMissing(true);
      return;
    }
    onSelect(choice);
  }

  return (
    <ScreenFrame
      title={t('accounts.create_title')}
      subtitle={invitation?.school}
      footer={<Button label={t('accounts.who.continue')} onPress={next} />}
    >
      <StepHeader step={1} total={choice === 'adult' ? 3 : 4} title={t('accounts.who.title')} onBack={onBack} />
      {invitation && <InvitationBanner {...invitation} />}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('accounts.who.title')}
        style={[
          styles.list,
          { paddingVertical: space[1], borderRadius: radius.md, backgroundColor: colors['surface-1'] },
        ]}
      >
        <ChoiceRow
          title={t('accounts.who.child_title')}
          detail={t('accounts.who.child_detail')}
          icon="family_restroom"
          color="athlete-1"
          selected={choice === 'child'}
          onPress={() => choose('child')}
        />
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
        <ChoiceRow
          title={t('accounts.who.adult_title')}
          detail={t('accounts.who.adult_detail')}
          icon="person"
          color="athlete-2"
          selected={choice === 'adult'}
          onPress={() => choose('adult')}
        />
      </View>
      {missing && (
        <View style={[styles.error, { gap: space[1] }]}>
          <Icon name="error" size="icon-sm" color="danger-text" />
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.errorText, typography.caption, { color: colors['danger-text'] }]}
          >
            {t('accounts.who.choose')}
          </Text>
        </View>
      )}
      {choice === 'child' && (
        <Banner variant="info" icon="info">
          {t('accounts.who.child_notice')}
        </Banner>
      )}
    </ScreenFrame>
  );
}
