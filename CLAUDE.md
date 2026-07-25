# CLAUDE.md - Urban Heat Engineering Knowledge Base

## Master Source of Truth (/docs)
This repository contains an immutable `/docs` directory. **You are forbidden from guessing, assuming, or hallucinating product requirements.** Before executing any code generation, you must query and cross-reference:
1. `/docs/02_Urban_Heat_Wireframes.html` -> For visual layout, hex codes, HUD structure, and slider mechanics. (Path updated 2026-07-25: previously referenced as `/docs/urban-heat-wireframes.html`, which did not match the actual file on disk.)
2. `/docs/03_Brand_Bible_and_ICP.md` -> For the WAWA citizen-science tone and clinical light-mode tokens. (Path updated 2026-07-25: previously referenced as `/docs/Brand_Bible_and_ICP.md`, which did not match the actual file on disk.)

## Tech Stack & Runtime Environment
- **Framework:** React Native (TypeScript) via Expo SDK
- **Runtime:** Custom Development Client ONLY (`npx expo run:android`).
- **State Management:** Zustand (strictly enforced for high-frequency data streams).
- **Local Database:** `expo-sqlite` (Offline-first architecture).
- **Cloud Database & Auth:** Supabase (PostgreSQL with PostGIS).
- **BLE Hardware Driver:** `react-native-ble-plx`

## Critical Engineering Guardrails
### 1. The React Re-Render Ban (1Hz Telemetry)
Never store live sensor data inside standard React `useState`. Write directly to a Zustand store.

### 2. Zero-RAM Background Caching
Execute synchronous writes directly to the local SQLite database disk and immediately clear the payload from JS runtime memory. 

### 3. Offline-First Data Routing
All data writes locally to SQLite first. Sync to Supabase only occurs when the user explicitly ends the session.

## Directory Structure
src/
├── components/         # Atomic UI components
├── config/             # Immutable constants
├── database/           # SQLite schema definitions
├── services/           # Decoupled background workers
├── store/              # Zustand atomic stores
└── screens/            # Core navigation screens

---

# Urban Heat — Project Context for Claude Code
*(Merged 2026-07-25 — content below was added from the canonical kickoff brief. Nothing above this line was removed. See note at end of file re: overlap with sections above.)*

## Mission
Mobile geospatial tool for citizen scientists (primary partner: West Atlanta
Watershed Alliance / WAWA) to log localized Urban Heat Islands using BLE proxy
sensors. Core loop: Authenticate -> Connect BLE Sensor -> Walk Transect
(background location + 1Hz temp logging) -> End Trek -> Sync to Supabase ->
Export CSV.

## Roadmap Constraint
MVP is STRICTLY Android. Do not configure iOS native files, CocoaPods, or
Apple permissions. All build focus: `npx expo run:android`.

## The Three Mobile Gotchas (non-negotiable)
1. **Zustand over useState/Context:** `useState` and React Context are BANNED
   for the 1Hz BLE telemetry stream. Route packets to an isolated atomic
   Zustand store (`useTelemetryStore`); only specific HUD text nodes subscribe.
2. **Zero-RAM disk sync:** Background location + telemetry writes go
   synchronously to local SQLite (`expo-sqlite`), offline-first. Dump payloads
   from active memory immediately; background JS arrays must stay under 15MB.
3. **Custom Dev Client only:** Standard Expo Go is BANNED (no native BLE
   background support). Compile via `npx expo run:android` or EAS custom
   dev client.

## Hardware Proxy (MVP)
PocketLab Voyager (device name: PL GT M201) emulating future proprietary
hardware. All raw BLE bytes pass through `src/services/bleAdapter.ts`
(Adapter Pattern) and normalize into a `SensorTelemetryPacket` interface.
- Service UUID: F000AA11-0452-4000-B000-000000000000
- Notification Characteristic (CCCD): F000AA13-0452-4000-B000-000000000000

## Documentation Map
- `docs/01_PRD_and_Tech_Stack.md` — mission, core loop, full tech stack
- `docs/02_Urban_Heat_Wireframes.html` — 10-screen UX flow + CSS tokens
- `docs/03_Brand_Bible_and_ICP.md` — visual system, color tokens, ICP tiers
- `docs/04_Hardware_Emulation_Strategy.md` — BLE proxy, Adapter Pattern, UUIDs
- `docs/05_Agile_Sprint_Backlog.md` — Sprint 1 tasks, schemas, 1Hz rules

## Note on overlap with pre-existing sections above
The "Master Source of Truth," "Tech Stack & Runtime Environment," and
"Critical Engineering Guardrails" sections above cover much of the same
ground as "Mission," "Roadmap Constraint," and "The Three Mobile Gotchas"
below. No contradictions were found between them — the newer sections add
detail (Android-only constraint, 15MB background array ceiling, verified BLE
UUIDs, PL GT M201 device name) not present above. Both are left in place per
instructions; consider consolidating manually if duplication becomes
confusing for future readers.
