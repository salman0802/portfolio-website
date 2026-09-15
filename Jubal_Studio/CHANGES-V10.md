# Jubal Studio V10 — Performance Console Visibility

- Split the Live/Performance screen into two vertical regions.
- Performance Console is now a fixed-priority region and does not scroll away with dock panels on desktop.
- Harmony, Controller, Arranger, Recorder, and the main keyboard live inside a separate `performance-workarea` scroller.
- All dock panel visibility, drag, resize, and persisted localStorage layout behavior remains unchanged.
- Optional sticky keyboard continues to work inside the new work-area scroller.
- Added a compact console density mode for shorter laptop displays.
- Mobile/tablet fallback retains normal whole-view scrolling where vertical space is limited.
