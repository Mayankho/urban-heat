Act as a Principal Software Architect and Lead Mobile Engineer. We are initializing the repository for "Urban Heat". 

PHASE 1: TOTAL SYSTEM INGESTION (DO NOT WRITE SRC CODE YET)
Read the root `CLAUDE.md` file, and then systematically read every single file inside the `/docs` directory. I need you to index the complete business, scientific, and technical scope of this project. 

Specifically synthesize:
1. The 10-screen UX flow and custom CSS tokens inside `/docs/02_Urban_Heat_Wireframes.html` (path updated 2026-07-25; previously referenced as `/docs/urban-heat-wireframes.html`)
2. The exact database table schemas and 1Hz writing rules.
3. The West Atlanta Watershed Alliance (WAWA) field use-case.
4. The three "Mobile Gotchas" (Zustand over useState, Zero-RAM caching, and Custom Dev Clients) defined in `CLAUDE.md`.

PHASE 2: THE ARCHITECTURAL PROPOSAL
Once you have fully read and mapped the `/docs` directory, generate a markdown file in the root named `IMPLEMENTATION_PLAN.md`. In this file, write out:
- Your exact interpretation of the project goals.
- The precise TypeScript interface you will create for `SensorTelemetryPacket` tracking Characteristic UUID: F000AA13-0452-4000-B000-000000000000.
- The exact raw SQL strings you will use to generate the local SQLite `trek_points` table.
- A step-by-step checklist of the exact files you will create to complete Sprint 1.
- A formal statement confirming you understand that standard `useState` is banned for the 1Hz BLE stream.

Output a summary of your ingestion to me in the terminal, tell me `IMPLEMENTATION_PLAN.md` has been written, and ask me for my explicit "PROCEED" command before you generate any executable code.
