/**
 * Shared UI atoms — direct ports of the wireframe's CSS classes.
 *
 * Each component names the wireframe class it implements so the mapping stays
 * auditable against docs/02. Colours and spacing come from config/theme.ts;
 * there are no inline hex literals here.
 */

import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { COLORS, HEAT, SPACE, TABULAR_NUMS, TYPE } from '@/config/theme';

/** `.label-xs` — 10px, uppercase, 1.5px tracking, muted, 600 weight. */
export function LabelXS({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.labelXs, style]}>{children}</Text>;
}

/** `.card` — surface background, 1px structural border, 16px padding, no radius. */
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** `.btn` — inverted fill (text colour bg), uppercase, 700, 1px tracking. */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  locked = false,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  locked?: boolean;
}) {
  const isOff = disabled || locked;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isOff }}
      onPress={isOff ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        // `.btn.locked` — opacity .3, not-allowed
        isOff && styles.btnLocked,
        pressed && !isOff && styles.btnPressed,
      ]}
    >
      <Text style={styles.btnText}>
        {locked ? `🔒  ${label}` : label}
      </Text>
    </Pressable>
  );
}

/** `.btn.secondary` — transparent, muted text, bordered, not uppercase. */
export function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.btnSecondary}>
      <Text style={styles.btnSecondaryText}>{label}</Text>
    </Pressable>
  );
}

/** `.input` — bg fill, structural border, 14px/16px padding, 12px text. */
export function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  autoCapitalize = 'none',
  mono = false,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'characters';
  mono?: boolean;
  keyboardType?: 'default' | 'email-address';
}) {
  return (
    <View style={styles.fieldGroup}>
      <LabelXS>{label}</LabelXS>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.muted}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        style={[styles.input, mono && styles.codeInput]}
      />
    </View>
  );
}

/** `.toggle` — segmented control; active segment inverts to the text colour. */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.toggle}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[
              styles.toggleOpt,
              index > 0 && styles.toggleOptDivider,
              active && styles.toggleOptActive,
            ]}
          >
            <Text style={[styles.toggleOptText, active && styles.toggleOptTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** `.pill-dot` — 6px status dot. */
export function PillDot({ color }: { color: string }) {
  return <View style={[styles.pillDot, { backgroundColor: color }]} />;
}

/** `.heat-strip` — the five-band reference strip. */
export function HeatStrip() {
  return (
    <View style={styles.heatStrip}>
      {[HEAT.cool, HEAT.normal, HEAT.warn, HEAT.crit, HEAT.danger].map((c) => (
        <View key={c} style={[styles.heatStripSegment, { backgroundColor: c }]} />
      ))}
    </View>
  );
}

/** `.hdr-title` — 16px, 800, 2px tracking. */
export function HeaderTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.hdrTitle}>{children}</Text>;
}

/** `.prompt` — 12px muted body copy at 1.6 line height. */
export function Prompt({ children }: { children: ReactNode }) {
  return <Text style={styles.prompt}>{children}</Text>;
}

/** `.portal-hdr` — screen header with greeting + organisation subtitle. */
export function PortalHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.portalHdr}>
      <Text style={styles.portalGreet}>{title}</Text>
      <Text style={styles.portalOrg}>{subtitle}</Text>
    </View>
  );
}

/** `.spacer` — flex:1 gap that pushes trailing content to the bottom. */
export function Spacer() {
  return <View style={styles.spacer} />;
}

/** Monospace diagnostics block — `.diag-card`. */
export function DiagnosticsCard({ children }: { children: ReactNode }) {
  return <View style={styles.diagCard}>{children}</View>;
}

export function DiagnosticsRow({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.diagLine}>
      {'• '}
      {label}
      {': '}
      <Text style={styles.diagValue}>{value}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  labelXs: {
    fontSize: 10,
    letterSpacing: TYPE.labelSpacing,
    textTransform: 'uppercase',
    color: COLORS.muted,
    fontWeight: '600',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACE.s2,
  },
  btn: {
    backgroundColor: COLORS.text,
    paddingVertical: 14,
    paddingHorizontal: SPACE.s2,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { opacity: 0.85 },
  btnLocked: { opacity: 0.3 },
  btnText: {
    color: COLORS.bg,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: SPACE.s2,
    width: '100%',
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  fieldGroup: { flexDirection: 'column', gap: 4 },
  input: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: SPACE.s2,
    fontSize: 12,
    color: COLORS.text,
  },
  codeInput: {
    textAlign: 'center',
    letterSpacing: 6,
    fontFamily: TYPE.monoFamily,
    fontSize: 18,
    paddingVertical: SPACE.s3,
    fontWeight: '700',
  },
  toggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  toggleOpt: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  toggleOptDivider: { borderLeftWidth: 1, borderLeftColor: COLORS.border },
  toggleOptActive: { backgroundColor: COLORS.text },
  toggleOptText: { fontSize: 9.5, color: COLORS.muted, textAlign: 'center' },
  toggleOptTextActive: { color: COLORS.bg, fontWeight: '700' },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  heatStrip: { flexDirection: 'row', height: 6, width: '100%' },
  heatStripSegment: { flex: 1 },
  hdrTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
    color: COLORS.text,
  },
  prompt: { fontSize: 12, color: COLORS.muted, lineHeight: 19 },
  portalHdr: {
    paddingVertical: SPACE.s2,
    paddingHorizontal: SPACE.s3,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  portalGreet: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: COLORS.text,
  },
  portalOrg: { fontSize: 10, color: COLORS.muted, marginTop: 4, letterSpacing: 0.5 },
  spacer: { flex: 1 },
  diagCard: {
    padding: SPACE.s2,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  diagLine: {
    fontFamily: TYPE.monoFamily,
    fontSize: 10,
    color: COLORS.muted,
    lineHeight: 17,
  },
  diagValue: { color: COLORS.text, fontWeight: '700', fontVariant: TABULAR_NUMS },
});
