# Urban Heat: Agile Sprint Backlog (05_Agile_Sprint_Backlog.md)

## Sprint 1: Architecture & Local Cache Baseline

*   **Task 1.1: Local Database Initialization**
    *   Implement `expo-sqlite`. Create `sessions` table and `trek_points` table (id, session_id, timestamp_utc, latitude, longitude, ambient_temp_c, humidity_pct, heat_index).
*   **Task 1.2: The Zustand Telemetry Pipeline (Patched)**
    *   *Mandate:* `useState` and React Context are BANNED for the 1Hz BLE stream. 
    *   Route incoming packets to an isolated atomic Zustand store (`useTelemetryStore`). Only specific HUD UI text nodes subscribe.
*   **Task 1.3: Zero-RAM Background Disk Sync (Patched)**
    *   Configure `expo-location` background listeners. Execute synchronous writes directly to the local SQLite disk. 
    *   *Mandate:* Dump the payload from active memory instantly. Background JS arrays must stay under 15MB to survive iOS background assassins.
*   **Task 1.4: Custom Dev Client Enforcement**
    *   Hard-disable standard Expo Go testing. Compile via `npx expo run:android` to support native BLE background drivers.
*   **Task 1.5: The Field Science App Store Shield**
    *   Embed WAWA institutional research justification text for future App Store Connect submissions to justify 'Always Allow' background location permissions.
