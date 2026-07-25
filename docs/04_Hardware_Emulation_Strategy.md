# Urban Heat: Hardware Emulation Strategy (04_Hardware_Emulation_Strategy.md)

## The Hardware Proxy
During the MVP phase, we are using the **PocketLab Voyager (PL GT M201)** as a proxy sensor to emulate our future proprietary hardware. 

## The Adapter Pattern Architecture
The mobile app must never tightly couple UI components to the PocketLab. 
All raw incoming Bluetooth data must pass through an isolated Adapter (`src/services/bleAdapter.ts`).
This normalizes the hex bytes into a standard `SensorTelemetryPacket` interface.

## Verified Hardware Coordinates (From Field Test)
*   **Device Name:** PL GT M201
*   **Service UUID:** F000AA11-0452-4000-B000-000000000000
*   **Target Notification Characteristic (CCCD):** F000AA13-0452-4000-B000-000000000000
