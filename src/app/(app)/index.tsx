import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { t } from '../../core/i18n';

export default function Home() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>{t('home.title')}</Text>
      {__DEV__ && <Link href="/gallery">{t('dev.gallery.open')}</Link>}
    </View>
  );
}
