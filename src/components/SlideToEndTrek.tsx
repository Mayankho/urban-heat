/**
 * Wireframe Screen 2.1 — "Slide to End Trek".
 *
 * A faithful port of the wireframe's drag interaction, including its state
 * machine: drag → release below threshold snaps back; drag past ~98% completes,
 * turns the knob green (`--normal`), fills the track, and shows "Trek Ended".
 *
 * WHY THIS IS A DRAG AND NOT A BUTTON: ending a trek is destructive to an
 * in-progress scientific recording. The wireframe deliberately requires a
 * deliberate gesture, and this product treats accidental session termination as
 * data loss. Do not "simplify" this to a tap.
 *
 * Implemented with PanResponder and the Animated API rather than
 * react-native-gesture-handler, to avoid adding a dependency that was not in the
 * approved stack for a single interaction.
 */

import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { COLORS, HEAT, SPACE } from '@/config/theme';

const KNOB_SIZE = 42;
const TRACK_HEIGHT = 48;
const INSET = 3;
/** Fraction of travel that counts as complete, matching the wireframe's
 *  `kl >= maxL - 2` check on a ~250px track. */
const COMPLETE_AT = 0.96;

export function SlideToEndTrek({ onComplete }: { onComplete: () => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [done, setDone] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;

  /** Maximum knob travel in px. */
  const maxTravel = Math.max(0, trackWidth - KNOB_SIZE - INSET * 2);

  // Recreated only when travel or completion state changes — PanResponder closes
  // over these values, so a stale responder would use a stale maxTravel.
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !done,
        onMoveShouldSetPanResponder: () => !done,
        onPanResponderMove: (_evt, gesture) => {
          if (done) return;
          const next = Math.max(0, Math.min(gesture.dx, maxTravel));
          translateX.setValue(next);
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (done) return;
          const travelled = Math.max(0, Math.min(gesture.dx, maxTravel));
          if (maxTravel > 0 && travelled / maxTravel >= COMPLETE_AT) {
            setDone(true);
            Animated.timing(translateX, {
              toValue: maxTravel,
              duration: 180,
              useNativeDriver: true,
            }).start(() => onComplete());
          } else {
            // Snap back — the wireframe's reset().
            Animated.timing(translateX, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          if (!done) {
            Animated.timing(translateX, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [done, maxTravel, onComplete, translateX]
  );

  const onLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  // `.slider .fill` grows with the knob. Width is not animatable on the native
  // driver, so the fill is a scaled view anchored left instead.
  const fillScale = maxTravel === 0 ? 0 : Animated.divide(translateX, maxTravel);

  return (
    <View style={styles.wrap}>
      <View style={styles.track} onLayout={onLayout}>
        <Animated.View
          style={[
            styles.fill,
            done && styles.fillDone,
            {
              transform: [
                {
                  scaleX:
                    maxTravel === 0
                      ? 0
                      : (fillScale as Animated.AnimatedInterpolation<number>),
                },
              ],
            },
          ]}
        />
        <View style={styles.labelWrap} pointerEvents="none">
          <Text style={[styles.label, done && styles.labelDone]}>
            {done ? 'Trek Ended' : <><Text style={styles.chevrons}>›››</Text> Slide to End Trek</>}
          </Text>
        </View>
        <Animated.View
          {...responder.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel="Slide to end trek"
          style={[
            styles.knob,
            done && styles.knobDone,
            { transform: [{ translateX }] },
          ]}
        >
          {/* The wireframe's white stop square. */}
          <View style={styles.stopIcon} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: SPACE.s2,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  track: {
    height: TRACK_HEIGHT,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    // rgba(231,76,60,.15) — --danger at 15%
    backgroundColor: 'rgba(231,76,60,0.15)',
    transformOrigin: 'left',
  },
  fillDone: { backgroundColor: 'rgba(46,204,113,0.25)' },
  labelWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: COLORS.muted },
  labelDone: { color: COLORS.text },
  chevrons: { color: HEAT.danger },
  knob: {
    position: 'absolute',
    left: INSET,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    backgroundColor: HEAT.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knobDone: { backgroundColor: HEAT.normal },
  stopIcon: { width: 12, height: 12, backgroundColor: '#FFFFFF' },
});
