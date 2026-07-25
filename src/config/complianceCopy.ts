/**
 * TASK 1.5 — "The Field Science App Store Shield"
 *
 * ============================================================================
 * ⚠️  DRAFT — PENDING WAWA APPROVAL. DO NOT SUBMIT TO ANY STORE AS-IS.
 * ============================================================================
 *
 * docs/05_Agile_Sprint_Backlog.md Task 1.5 directs us to "Embed WAWA
 * institutional research justification text for future App Store Connect
 * submissions to justify 'Always Allow' background location permissions."
 *
 * The source documents supply NO actual wording (IMPLEMENTATION_PLAN.md G-02),
 * and institutional language attributed to a real nonprofit is not ours to
 * invent. Everything below is placeholder copy written to the right shape and
 * length so the constant exists and is wired in — it MUST be reviewed and
 * approved by WAWA and by the Urban Heat product owner before any submission.
 *
 * SCOPE THIS SPRINT: strings only. Per the explicit roadmap directive, NO
 * Apple-side configuration has been performed — there is no Info.plist, no
 * CocoaPods, no NSLocation* keys, and no `ios` block in app.config.ts.
 *
 * NOTE ON PLATFORM: Task 1.5 names App Store Connect (Apple), but the MVP ships
 * Android-only. The same justification will be required sooner for the Google
 * Play Console "Background Location Access" declaration, which is a separate
 * review process with its own form, its own video-demo requirement, and its own
 * wording constraints. Budget for both. See PLAY_CONSOLE_DECLARATION below.
 */

/** Marks copy that has not been through institutional review. */
export const COMPLIANCE_COPY_STATUS = 'DRAFT_PENDING_WAWA_APPROVAL' as const;

/**
 * Long-form institutional research justification.
 * Target audience: an app-store reviewer deciding whether persistent background
 * location is warranted.
 */
export const BACKGROUND_LOCATION_JUSTIFICATION = `[DRAFT — PENDING WAWA APPROVAL]

Urban Heat is a citizen-science instrument operated in partnership with the West
Atlanta Watershed Alliance (WAWA), a community environmental justice organization
documenting Urban Heat Island (UHI) effects in the Proctor Creek watershed.

Background location access is scientifically essential, not incidental. Trained
volunteers walk continuous pedestrian transects while a Bluetooth Low Energy
temperature probe streams ambient readings once per second. Each reading must be
geospatially anchored to the sidewalk-scale location where it was taken. A single
interruption in the location stream produces a gap in the transect, and a
transect with gaps cannot be used to establish the thermal gradient between
shaded and unshaded segments of the same street — which is the specific
measurement this research exists to produce.

Volunteers necessarily lock their phones and place them in a pocket or pack while
walking in high heat, often exceeding 100°F. Foreground-only location access
would terminate data collection at the moment the screen locks, making the
instrument unusable for its stated scientific purpose.

Collected data is used exclusively to produce heat-exposure evidence for
community advocacy and for municipal sustainability offices and Chief Heat
Officers evaluating tree-canopy and cooling-infrastructure investment. Location
data is never used for advertising, never sold, never brokered, and never shared
with third parties. Recording occurs only during an explicitly user-initiated
session, is accompanied by a persistent visible notification for its entire
duration, and terminates when the volunteer ends the session.`;

/**
 * Short form for constrained fields (store permission-rationale inputs are
 * frequently capped, and reviewers see this string before the long form).
 */
export const BACKGROUND_LOCATION_JUSTIFICATION_SHORT = `[DRAFT] Urban Heat records continuous 1 Hz temperature readings along walked pedestrian transects for community Urban Heat Island research with the West Atlanta Watershed Alliance. Each reading must be geospatially anchored, and volunteers walk with the phone locked in a pocket, so background location is required for the instrument to function. Recording is user-initiated, shows a persistent notification throughout, and location data is never sold or shared.`;

/**
 * In-app rationale shown on Wireframe Screen 1.4 (Location Hard Gate) BEFORE the
 * OS permission dialog appears. Copy is taken from the wireframe itself, which is
 * approved design language, so this string is NOT draft.
 */
export const IN_APP_LOCATION_RATIONALE = {
  heading: 'CRITICAL COMPLIANCE ACCESS REQUIRED',
  body: "Pocket logging requires background location parameters set to 'Always Allow' to guarantee an un-killable data stream.",
  steps: [
    'Open OS System Settings',
    'Access Apps → Urban Heat → Permissions',
    "Toggle Location to 'Always Allow'",
  ],
} as const;

/**
 * Persistent foreground-service notification copy, taken from Wireframe Screen
 * 2.2 ("Background Screen Ledger"). Also approved design language.
 *
 * Android requires this notification for the entire life of the location
 * foreground service; it is the user-visible proof of the "Continuous background
 * thread secured" guarantee.
 */
export const FOREGROUND_SERVICE_NOTIFICATION = {
  title: 'Active Climate Expedition Running',
  /** `{campaign}` and `{temp}` are substituted at runtime by locationService. */
  bodyTemplate: 'Logging {campaign}… Current ambient temp: {temp}.',
  fallbackCampaign: 'field campaign',
  threadAssurance: 'Continuous background thread secured',
} as const;

/**
 * Google Play Console background-location declaration scaffold.
 * Separate from, and required earlier than, the Apple submission.
 */
export const PLAY_CONSOLE_DECLARATION = {
  status: COMPLIANCE_COPY_STATUS,
  coreFunctionality:
    '[DRAFT] Geospatially-anchored 1 Hz ambient temperature logging along walked pedestrian transects for Urban Heat Island research.',
  whyForegroundInsufficient:
    '[DRAFT] Volunteers walk with the device locked and pocketed in extreme heat. Foreground-only access ends the location stream at screen lock, producing gaps that invalidate the transect.',
  userBenefit:
    '[DRAFT] Produces the heat-exposure evidence base community advocates and municipal Chief Heat Officers use to target tree-canopy and cooling investment.',
  /** Play review requires a video demonstrating the in-app disclosure and the
   *  permission flow. Not yet produced. */
  demoVideoUrl: null as string | null,
} as const;
