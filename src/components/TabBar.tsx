/**
 * Wireframe `.tabbar` — the three-tab bottom navigation (Track / Campaigns / Profile).
 *
 * Icons in the wireframe are inline SVGs. Rather than add react-native-svg for
 * three glyphs, these are text marks at the same visual weight — the icon set is
 * a cosmetic follow-up, not a Sprint 1 deliverable, and adding a dependency for
 * it would exceed the approved stack.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACE } from '@/config/theme';
import { useNavigationStore, type ScreenId } from '@/store/useNavigationStore';

export type TabKey = 'track' | 'campaigns' | 'profile';

const TABS: ReadonlyArray<{ key: TabKey; label: string; mark: string; screen: ScreenId }> = [
  { key: 'track', label: 'Track', mark: '◈', screen: 'launchpad' },
  { key: 'campaigns', label: 'Campaigns', mark: '◎', screen: 'enrollment' },
  { key: 'profile', label: 'Profile', mark: '◍', screen: 'profile' },
];

export function TabBar({ active }: { active: TabKey }) {
  const navigate = useNavigationStore((s) => s.navigate);

  return (
    <View style={styles.tabbar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => navigate(tab.screen)}
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
