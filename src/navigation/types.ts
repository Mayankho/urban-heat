/**
 * Route map for the root native stack.
 *
 * Replaces the Sprint 1 `useNavigationStore` scaffold, which had no history and
 * therefore no way back — every screen was a dead end reachable only by whatever
 * forward path happened to exist.
 */
export type RootStackParamList = {
  Welcome: undefined;
  Enrollment: undefined;
  BleSync: undefined;
  LocationGate: undefined;
  Launchpad: undefined;
  Live: undefined;
  Validation: undefined;
  Profile: undefined;
  Settings: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // Gives useNavigation() full type inference without per-call generics.
    interface RootParamList extends RootStackParamList {}
  }
}
