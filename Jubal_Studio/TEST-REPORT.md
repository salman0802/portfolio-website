# V5 Regression Report

Static checks performed on the packaged build:

- All JavaScript modules pass `node --check`.
- 185 HTML IDs found; 185 unique; no duplicate IDs.
- All local ES-module imports resolve.
- CSS braces are balanced (441 / 441).
- Docking engine stores `dockWidth` / `dockHeight` pixel state.
- No `spanForPixels`, `dockCols`, or `dockRows` conversion remains in `ui.js`.
- Continuous resize writes direct pixel width and height on every animation-frame update.
- Recorder file input is bound to `importMidiToRecorder`.
- Practice playback visual events are consumed by `main-visuals.js`.
- Transport scheduler look-ahead (80 ms) is greater than scheduler update interval (25 ms).

Mock playback-path tests:

1. Recorder MIDI import: a mocked 2-note MIDI file imports 2 notes, updates the filename/note-count status, enables Recorder controls, and creates 2 playback events.
2. Practice / Player: a mocked 2-note file loads with 1.2 s duration, enables playback, and creates 2 scheduled playback events.
3. MIDI Editor: a mocked 2-note editor model creates 2 scheduled playback events.
4. All three scheduled playback paths use a short `+0.03` Transport lead-in so the first event is enqueued before playback starts.

Hardware/browser note: actual audio output, Web MIDI, and browser autoplay policy still depend on the target browser/device. The source-level scheduling defect and missing wiring that caused the reported failures are fixed in this build.
