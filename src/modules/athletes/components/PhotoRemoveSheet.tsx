import { t } from '../../../core/i18n';
import { ConfirmSheet } from '../../../core/ui';
import '../i18n';

export type PhotoRemoveSheetProps = {
  visible: boolean;
  // 'manual': the person pressed "Quitar foto". 'withdrawn': they just withdrew show_photo, so the photo is already hidden and the question is whether to delete it too.
  reason: 'manual' | 'withdrawn';
  // The last try to delete did not work (no signal): the sheet says so and keeps the choice open.
  failed?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Presentational. Taking a photo away is the one thing in this flow that cannot be undone, so it always asks (destructive confirm, safe default).
export function PhotoRemoveSheet({ visible, reason, failed = false, onConfirm, onCancel }: PhotoRemoveSheetProps) {
  const base = reason === 'manual' ? 'athletes.photo.remove_sheet' : 'athletes.photo.withdrawn_sheet';
  return (
    <ConfirmSheet
      visible={visible}
      title={t(`${base}.title`)}
      message={failed ? t('athletes.photo.sheet_error') : t(`${base}.message`)}
      confirmLabel={t(`${base}.confirm`)}
      cancelLabel={t(`${base}.keep`)}
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
