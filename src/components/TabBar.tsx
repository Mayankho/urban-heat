/**
 * Wireframe `.tabbar` — the three-tab bottom navigation (Track / Campaigns / Profile).
 *
 * Kept as a custom component rather than a React Navigation bottom-tab navigator:
 * the wireframe's bar is a specific visual object (48px, structural top border, no
 * elevation, 9px uppercase labels) and re-skinning the stock navigator to match
 * would be more code than this, for no behavioural gain. It drives the same native
 * stack, so history and the back button still work.
 *
 * Icons in the wireframe are inline SVGs; these are text marks at matching weight.
 */

import { useNavigation, useNavigationState } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACE } from '@/config/theme';
import type { RootStackParamList } from '@/navigation/types';

export type TabKey = 'track' | 'campaigns' | 'profile';

const TABS: ReadonlyArray<{
  key: TabKey;
  label: string;
  mark: string;
  route: keyof RootStackParamList;
}> = [
  { key: 'track', label: 'Track', mark: '◈', route: 'Launchpad' },
  { key: 'campaigns', label: 'Campaigns', mark: '◎', route: 'Enrollment' },
  { key: 'profile', label: 'Profile', mark: '◍', route: 'Profile' },
];

export function TabBar({ active }: { active?: TabKey }) {
  const navigation = useNavigation();
  // Derive the active tab from the real route when the caller does not pin one,
  // so the highlight cannot drift out of sync with the navigator.
  const currentRoute = useNavigationState((s) => s.routes[s.index]?.name);
  const derived = TABS.find((t) => t.route === currentRoute)?.key;
  const activeKey = active ?? derived;

  return (
    <View style={styles.tabbar}>
      {TABS.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => navigation.navigate(tab.route)}
            style={styles.tab}
          >
            <Text style={[styles.mark, isActive && styles.activeText]}>{tab.mark}</Text>
            <Text style={[styles.label, isActive && styles.activeText]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabbar: {
    height: 48,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  mark: { fontSize: 14, color: COLORS.muted, lineHeight: 16 },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeText: { color: COLORS.text, fontWeight: '800' },
});

export const TAB_BAR_HEIGHT = 48 + SPACE.s1;
