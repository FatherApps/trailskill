import { useState } from 'react';

import { t } from '../../../core/i18n';
import { Button, ConfirmSheet } from '../../../core/ui';
import '../i18n';

export type OfficialImportFooterProps = {
  // How many of the results found are chosen.
  count: number;
  importing: boolean;
  onImport: () => void;
};

// The import button and the question before it: nothing is imported until the guardian confirms.
export function OfficialImportFooter({ count, importing, onImport }: OfficialImportFooterProps) {
  // The sheet opens only when the button is tapped, never on its own.
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Button
        label={count === 0 ? t('results_import.update.list.none_selected') : t('results_import.update.list.import', { count })}
        loading={importing}
        loadingLabel={t('results_import.update.list.importing')}
        onPress={count === 0 || importing ? () => {} : () => setConfirming(true)}
      />
      <ConfirmSheet
        visible={confirming && count > 0}
        title={t('results_import.update.list.confirm.title', { count })}
        message={t('results_import.update.list.confirm.message')}
        confirmLabel={t('results_import.update.list.confirm.confirm')}
        cancelLabel={t('results_import.update.list.confirm.cancel')}
        onConfirm={() => {
          setConfirming(false);
          onImport();
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
