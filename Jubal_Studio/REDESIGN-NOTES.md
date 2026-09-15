# Jubal Studio — Professional UI Redesign

## What changed
- Rebuilt the visual system around a neutral professional workstation aesthetic.
- Replaced the cyber/LCD-heavy shell with a compact product header and workspace navigation.
- Reorganized panel controls into a contextual workspace toolbar.
- Converted the live console into a clean performance dashboard with clearer information hierarchy.
- Reworked module cards, controller pads/knobs, keyboard dock, track player, Academy visualizer, MIDI mapping modal, and piano-roll editor.
- Added responsive desktop/tablet/mobile behavior.
- Improved button, input, focus, status, disabled, recording, and MIDI-listening states.
- Hid live-only panel controls when the Practice & Player workspace is active.

## Compatibility approach
- Existing element IDs and data attributes used by the JavaScript modules were preserved.
- Audio, accompaniment, arranger, sequencer, MIDI processing, recording, playback, and note-event architecture were not rewritten.
- UI panel layout is now CSS-driven instead of assigning brittle fixed grid columns in JavaScript.
- Dynamic visual colors in MIDI pads, waterfall notes, track overview, and piano roll were aligned to the new design system.

## Files intentionally changed
- index.html
- styles.css
- ui.js
- midi.js
- academy-visualizer.js
- track-player.js
- midi-editor.js

All other modules are included unchanged so the package can be run as a complete project.
