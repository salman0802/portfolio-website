# Jubal Studio — Dockable Workspace Pass

## Fixed
- Harmony & Accompaniment mini keyboard no longer uses a fixed 280 px width.
- The chord keyboard now uses percentage-based white/black key geometry and scales to the panel width.
- Narrow Harmony panels remain contained instead of overflowing.

## OBS-style workspace docks
- Harmony, Controller, Arranger and Recorder are now dock panels.
- Drag a dock header to rearrange the component order.
- Drag the bottom-right grip to resize width and height on desktop-sized workspaces.
- Each dock scrolls internally when resized shorter than its content.
- Hide a dock from its header or from the existing workspace visibility buttons.
- Dock order, size and visibility persist in localStorage independently from musical settings.
- `Reset layout` restores the default arrangement and sizes.
- Under 1100 px the interface switches to a safe responsive 2-column layout; under 720 px it becomes one column and resize grips are disabled.

## Compatibility
- Existing panel IDs, control IDs, MIDI bindings and audio feature hooks are preserved.
- No audio, arranger, recorder or MIDI mapping behavior was moved into the dock manager.
