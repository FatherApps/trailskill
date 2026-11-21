import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { t } from '../../../core/i18n';
import { colors, radius, space } from '../../../core/theme';
import '../i18n';

const QR_SIZE = 200;

// The swimmer's share code as a QR (issue 1322): the plain code and nothing else, so scanning it is the same as typing it.
// Always dark on light, from the light theme's tokens: phone scanners read a light-on-dark QR unreliably, so the dark theme keeps the white tile.
export function ShareCodeQr({ code }: { code: string }) {
  const { ink, 'surface-1': tile } = colors.light;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('accounts.share_code.qr_label', { code })}
      style={{ alignSelf: 'center', padding: space[3], borderRadius: radius.md, backgroundColor: tile }}
    >
      <QRCode value={code} size={QR_SIZE} color={ink} backgroundColor={tile} />
    </View>
  );
}
