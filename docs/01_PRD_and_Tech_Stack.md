# Urban Heat: PRD & Tech Stack (01_PRD_and_Tech_Stack.md)

## Product Requirements Document (PRD)
**Mission:** Equip citizen scientists (specifically WAWA) with a mobile geospatial tool to log localized Urban Heat Islands (UHI) using BLE proxy sensors.
**Core Loop:** Authenticate -> Connect BLE Sensor -> Walk Transect (Background Location + 1Hz Temp Logging) -> End Trek -> Sync to Supabase -> Export CSV.

## Tech Stack
*   **Frontend:** React Native (TypeScript)
*   **Build Tool:** Expo (Custom Development Client ONLY - via EAS or local `run:android`. Standard Expo Go is BANNED).
*   **State Management:** Zustand (Strictly for high-frequency 1Hz BLE streams to prevent React re-renders).
*   **Local Caching:** `expo-sqlite` (Offline-first. All trek points write to disk instantly).
*   **Cloud Backend:** Supabase (PostgreSQL + PostGIS spatial extensions).
*   **Hardware BLE Driver:** `react-native-ble-plx`
