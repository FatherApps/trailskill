// react-native, svg, safe-area-context, fetch and supabase-js load lazily, so the first test of each file paid for it
// inside its own 5 s timeout (#185, #190). Load them here instead, outside any test.
const rn = require('react-native');

void [rn.AccessibilityInfo, rn.ActivityIndicator, rn.FlatList, rn.Image, rn.Modal, rn.Pressable, rn.ScrollView, rn.TextInput];
void globalThis.fetch;
require('react-native-safe-area-context');
require('react-native-svg');
require('@supabase/supabase-js');
require('expo-secure-store');
// Native modules of the timing screens: the tests look at the calls, never at the device.
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(() => Promise.resolve()), deactivateKeepAwake: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: 'light' } }));
