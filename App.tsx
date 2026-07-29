/**
 * Urban Heat — application root.
 *
 * IMPORT ORDER MATTERS: backgroundLocationTask must be imported for its side
 * effect (TaskManager.defineTask) at module scope, BEFORE any
 * startLocationUpdatesAsync call. TaskManager requires the task to be defined in
 * global scope at startup so it can be re-registered when the OS revives the
 * process — deferring it into a component would break background recovery.
 */

import '@/services/backgroundLocationTask';

import { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '@/config/theme';
import { initializeDatabase } from '@/database/db';
import { findUnfinishedSession } from '@/database/sessionsRepo';
import { RootNavigator } from '@/navigation/RootNavigator';
import { initializeTelemetryPipeline } from '@/services/sessionController';
import { useAuthStore } from '@/store/useAuthStore';

function AppContent() {
  const restoreSession = useAuthStore((s) => s.restoreSession);

  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // 1. SQLite before anything else — every other subsystem can write to it.
        initializeDatabase();

        // 2. Wire the BLE adapter callbacks once, not per session.
        initializeTelemetryPipeline();

        // 3. Restore the cached JWT from disk. Requires NO network (G-12).
        await restoreSession();

        // 4. Surface a trek that was recording when the process died, rather than
        //    silently abandoning field data a volunteer walked miles to collect.
        const unfinished = findUnfinishedSession();
        if (unfinished !== null && __DEV__) {
          console.log(
            `[boot] recovered unfinished session ${unfinished.id} ` +
              `(${unfinished.pointCount} points). Visible in the Profile feed.`
          );
        }

        setReady(true);
      } catch (e) {
        setBootError(e instanceof Error ? e.message : 'Initialization failed.');
      }
    })();
  }, [restoreSession]);

  if (bootError !== null) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Initialization failed</Text>
          <Text style={styles.errorBody}>{bootError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.booting}>URBAN HEAT</Text>
          <Text style={styles.errorBody}>Initializing local cache…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // NavigationContainer renders its own safe-area handling, so the stack is not
  // wrapped in SafeAreaView here — doing so would double-inset the header.
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <RootNavigator />
    </>
  );
}

/**
 * SafeAreaProvider must sit above every consumer of SafeAreaView (including
 * React Navigation's header), so it wraps AppContent rather than living inside it.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  booting: { fontSize: 20, fontWeight: '800', letterSpacing: 4, color: COLORS.text },
  errorTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  errorBody: { fontSize: 11, color: COLORS.muted, textAlign: 'center', lineHeight: 16 },
});
