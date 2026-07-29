/**
 * Root native stack.
 *
 * WHY THIS REPLACED THE OLD STORE-BASED SWITCH
 * --------------------------------------------
 * Sprint 1 shipped a minimal `useNavigationStore` that just swapped which screen
 * rendered. It had no history, so there was no back affordance anywhere and the
 * Android hardware/gesture back button exited the app from any screen. Screen 3.3
 * was literally unreachable for a while because nothing pointed at it.
 *
 * A native stack gives real history: a header back button, the Android system back
 * gesture, and correct behaviour when the OS restores the app.
 *
 * HEADER STYLING follows the Brand Bible rather than platform defaults — surface
 * background, structural bottom border, no elevation shadow (the wireframe is
 * explicitly "flat / rigid"), uppercase tracked titles.
 *
 * TWO DELIBERATE EXCEPTIONS TO "BACK EVERYWHERE"
 * ----------------------------------------------
 * 1. `Welcome` — it is the stack root; there is nothing behind it.
 * 2. `Live` — a trek is recording. A stray back tap would walk away from an
 *    in-progress scientific recording, and the product treats accidental
 *    termination as data loss (hence the slide-to-end gesture rather than a
 *    button). The documented exit is the slide. Android system back is also
 *    intercepted there for the same reason.
 *
 * Everything else is freely reversible.
 */

import { NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS, HEAT, TYPE } from '@/config/theme';
import { BleSyncScreen } from '@/screens/BleSyncScreen';
import { CampaignEnrollmentScreen } from '@/screens/CampaignEnrollmentScreen';
import { LaunchpadScreen } from '@/screens/LaunchpadScreen';
import { LiveRecordingScreen } from '@/screens/LiveRecordingScreen';
import { LocationGateScreen } from '@/screens/LocationGateScreen';
import { ProfileImpactScreen } from '@/screens/ProfileImpactScreen';
import { SettingsDiagnosticsScreen } from '@/screens/SettingsDiagnosticsScreen';
import { ValidationScreen } from '@/screens/ValidationScreen';
import { WelcomeAuthScreen } from '@/screens/WelcomeAuthScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Navigation theme mapped onto the Brand Bible light tokens. */
const navTheme: Theme = {
  dark: false,
  colors: {
    primary: HEAT.danger,
    background: COLORS.bg,
    card: COLORS.surface,
    text: COLORS.text,
    border: COLORS.border,
    notification: HEAT.danger,
  },
  fonts: {
    regular: { fontFamily: TYPE.family ?? '', fontWeight: '400' },
    medium: { fontFamily: TYPE.family ?? '', fontWeight: '600' },
    bold: { fontFamily: TYPE.family ?? '', fontWeight: '700' },
    heavy: { fontFamily: TYPE.family ?? '', fontWeight: '800' },
  },
};

export function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName="Welcome"
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
          // native-stack's headerTitleStyle only accepts fontSize / fontWeight /
          // fontFamily / color — letterSpacing is not supported here, so the
          // tracked look is carried by the uppercase titles alone.
          headerTitleStyle: {
            fontSize: 12,
            fontWeight: '800',
            color: COLORS.text,
          },
          headerShadowVisible: false, // "flat / rigid" per the wireframe
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: COLORS.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="Welcome"
          component={WelcomeAuthScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Enrollment"
          component={CampaignEnrollmentScreen}
          options={{ title: 'CAMPAIGN' }}
        />
        <Stack.Screen
          name="BleSync"
          component={BleSyncScreen}
          options={{ title: 'SENSOR LINK' }}
        />
        <Stack.Screen
          name="LocationGate"
          component={LocationGateScreen}
          options={{ title: 'COMPLIANCE' }}
        />
        <Stack.Screen
          name="Launchpad"
          component={LaunchpadScreen}
          options={{ title: 'TRACK' }}
        />
        <Stack.Screen
          name="Live"
          component={LiveRecordingScreen}
          options={{
            // See "TWO DELIBERATE EXCEPTIONS" above: no header, no back, and the
            // Android system back gesture is disabled so an in-progress transect
            // cannot be abandoned by accident. Exit is the slide-to-end gesture.
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Validation"
          component={ValidationScreen}
          options={{ title: 'SAVE SESSION' }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileImpactScreen}
          options={{ title: 'OPERATOR' }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsDiagnosticsScreen}
          options={{ title: 'DIAGNOSTICS' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
