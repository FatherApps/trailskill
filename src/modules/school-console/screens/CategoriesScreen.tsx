import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Button, ConfirmSheet, Icon, StateView, Tag, TextField, useFocusRing, type IconName } from '../../../core/ui';
import '../i18n';
import { ConsoleLayout } from '../components/ConsoleLayout';
import type { ConsoleDestinationId } from '../components/ConsoleNav';
import type { Category } from '../data/categories';
import { athletesScreenColors } from './AthletesScreen';

export type CategoriesContent = { status: 'loading' | 'ready' | 'error'; categories: Category[] };

export type CategoriesScreenProps = {
  // The width available to the console in dp: the caller measures it (window or preview).
  width: number;
  schoolName: string;
  content: CategoriesContent;
  onNavigate: (id: ConsoleDestinationId) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onSetActive: (id: string, active: boolean) => void;
  // Shown with the error state when given.
  onRetry?: () => void;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
  // Where the screen starts: a row being renamed, or the confirmation of a deactivation already open (gallery and tests).
  initialRenamingId?: string;
  initialConfirmId?: string;
};

export const categoriesScreenColors: { card: ColorToken; name: ColorToken; move: ColorToken; moveOff: ColorToken; moveIcon: ColorToken; moveIconOff: ColorToken } = {
  card: 'surface-1',
  name: 'ink',
  move: 'surface-2',
  moveOff: 'surface-0',
  moveIcon: 'ink',
  moveIconOff: 'ink-muted',
};

// A round arrow button with the 48 dp touch target; unlike IconButton it can be unavailable (first and last row).
function MoveButton({ icon, label, disabled, onPress }: { icon: IconName; label: string; disabled: boolean; onPress: () => void }) {
  const { colors, radius, size } = useTheme();
  const { focusProps, ring } = useFocusRing();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      {...focusProps}
      style={[
        {
          width: size['target-min'],
          height: size['target-min'],
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.full,
          backgroundColor: colors[disabled ? categoriesScreenColors.moveOff : categoriesScreenColors.move],
        },
        ring,
      ]}
    >
      <Icon name={icon} color={disabled ? categoriesScreenColors.moveIconOff : categoriesScreenColors.moveIcon} />
    </Pressable>
  );
}

type RowProps = {
  category: Category;
  first: boolean;
  last: boolean;
  renaming: boolean;
  onStartRename: () => void;
  onStopRename: () => void;
  onRename: (name: string) => void;
  onMove: (direction: 'up' | 'down') => void;
  onDeactivate: () => void;
  onReactivate: () => void;
};

function CategoryRow({ category, first, last, renaming, onStartRename, onStopRename, onRename, onMove, onDeactivate, onReactivate }: RowProps) {
  const { colors, space, radius, typography } = useTheme();
  const [text, setText] = useState(category.name);
  const empty = text.trim() === '';
  const save = () => {
    if (empty) return;
    if (text.trim() !== category.name) onRename(text.trim());
    onStopRename();
  };

  return (
    <View
      style={{
        gap: space[3],
        padding: space[4],
        borderRadius: radius.md,
        backgroundColor: colors[categoriesScreenColors.card],
      }}
    >
      {renaming ? (
        <>
          <TextField label={t('schoolConsole.categories.rename_label')} value={text} onChangeText={setText} onSubmitEditing={save} returnKeyType="done" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] }}>
            <Button
              label={t('schoolConsole.categories.save')}
              onPress={save}
              disabledReason={empty ? t('schoolConsole.categories.name_required') : undefined}
            />
            <Button variant="secondary" label={t('schoolConsole.categories.cancel')} onPress={onStopRename} />
          </View>
        </>
      ) : (
        <>
          <View style={{ gap: space[2] }}>
            <Text style={[typography['body-strong'], { color: colors[categoriesScreenColors.name] }]}>{category.name}</Text>
            {!category.active && <Tag label={t('schoolConsole.categories.inactive')} />}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
            <MoveButton icon="arrow_upward" label={t('schoolConsole.categories.move_up', { name: category.name })} disabled={first} onPress={() => onMove('up')} />
            <MoveButton icon="arrow_downward" label={t('schoolConsole.categories.move_down', { name: category.name })} disabled={last} onPress={() => onMove('down')} />
            <Button
              variant="ghost"
              label={t('schoolConsole.categories.rename')}
              accessibilityHint={category.name}
              onPress={() => {
                setText(category.name);
                onStartRename();
              }}
            />
            {category.active ? (
              <Button variant="ghost" label={t('schoolConsole.categories.deactivate')} accessibilityHint={category.name} onPress={onDeactivate} />
            ) : (
              <Button variant="ghost" label={t('schoolConsole.categories.reactivate')} accessibilityHint={category.name} onPress={onReactivate} />
            )}
          </View>
        </>
      )}
    </View>
  );
}

// Presentational: no network, database or repository; the caller supplies the categories and handles the events.
export function CategoriesScreen({
  width,
  schoolName,
  content,
  onNavigate,
  onCreate,
  onRename,
  onMove,
  onSetActive,
  onRetry,
  scrollEnabled = true,
  initialRenamingId,
  initialConfirmId,
}: CategoriesScreenProps) {
  const { colors, space, typography } = useTheme();
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(initialRenamingId ?? null);
  const [confirmId, setConfirmId] = useState<string | null>(initialConfirmId ?? null);

  const canAdd = newName.trim() !== '';
  const add = () => {
    if (!canAdd) return;
    onCreate(newName.trim());
    setNewName('');
  };
  const confirming = content.categories.find((category) => category.id === confirmId);
  const { categories } = content;

  let body;
  if (content.status === 'loading') {
    body = <StateView kind="loading" />;
  } else if (content.status === 'error') {
    body = (
      <StateView
        kind="error"
        title={t('schoolConsole.categories.error.title')}
        message={t('schoolConsole.categories.error.message')}
        action={onRetry ? { label: t('schoolConsole.categories.error.retry'), onPress: onRetry } : undefined}
      />
    );
  } else {
    body = (
      <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: space[3] }}>
          <View style={{ flexGrow: 1, flexBasis: 240 }}>
            <TextField label={t('schoolConsole.categories.new_label')} value={newName} onChangeText={setNewName} onSubmitEditing={add} returnKeyType="done" />
          </View>
          <Button
            label={t('schoolConsole.categories.add')}
            onPress={add}
            disabledReason={canAdd ? undefined : t('schoolConsole.categories.name_required')}
          />
        </View>
        {categories.length === 0 ? (
          <StateView
            kind="empty"
            icon="group"
            title={t('schoolConsole.categories.empty.title')}
            message={t('schoolConsole.categories.empty.message')}
          />
        ) : (
          <View accessibilityRole="list" accessibilityLabel={t('schoolConsole.categories.list_label')} style={{ gap: space[3] }}>
            {categories.map((category, index) => (
              <CategoryRow
                key={category.id}
                category={category}
                first={index === 0}
                last={index === categories.length - 1}
                renaming={renamingId === category.id}
                onStartRename={() => setRenamingId(category.id)}
                onStopRename={() => setRenamingId(null)}
                onRename={(name) => onRename(category.id, name)}
                onMove={(direction) => onMove(category.id, direction)}
                onDeactivate={() => setConfirmId(category.id)}
                onReactivate={() => onSetActive(category.id, true)}
              />
            ))}
          </View>
        )}
      </>
    );
  }

  return (
    <ConsoleLayout width={width} schoolName={schoolName} activeId="settings" onSelect={onNavigate} scrollEnabled={scrollEnabled}>
      {/* Last resort: one long word at large text would break mid-word, so the title shrinks, never below 70 %. */}
      <Text
        accessibilityRole="header"
        numberOfLines={1} adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={[typography['title-lg'], { color: colors[athletesScreenColors.title] }]}
      >
        {t('schoolConsole.sections.settings_title')}
      </Text>
      <View style={{ width: '100%', maxWidth: 640, gap: space[4] }}>{body}</View>
      <ConfirmSheet
        visible={confirming !== undefined}
        title={t('schoolConsole.categories.confirm.title', { name: confirming?.name ?? '' })}
        message={t('schoolConsole.categories.confirm.message')}
        confirmLabel={t('schoolConsole.categories.confirm.confirm')}
        cancelLabel={t('schoolConsole.categories.confirm.cancel')}
        onConfirm={() => {
          if (confirming) onSetActive(confirming.id, false);
          setConfirmId(null);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </ConsoleLayout>
  );
}
