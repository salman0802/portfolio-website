# Jubal Studio V5 — Playback, Recorder Import, Controller Surface, Pixel Docking

## 1. Controller Surface
- Rebuilt the panel into a compact toolbar plus two adaptive banks: Performance Pads and Continuous Controls.
- Keyboard size, pad mode, and knob mode now share one compact command row.
- Pads and knobs use responsive grids that adapt to the exact dock width with container queries.
- Existing IDs and MIDI mapping behavior are preserved.

## 2. Practice & Player / MIDI Editor playback
- Fixed the scheduler configuration that could starve `Tone.Part`: scheduler look-ahead is now 80 ms with a 25 ms update interval.
- Live hardware/onscreen keys still use `Tone.immediate()` so this scheduler margin does not reintroduce live-key latency.
- Practice file playback validates/sorts notes, preserves velocity, resets transport safely, and starts after a 30 ms scheduling lead-in.
- The learning keyboard now consumes `jubal:learnVisualOn` / `jubal:learnVisualOff`, so imported MIDI visibly plays on the Practice piano.
- Changing the Practice instrument now also changes the active Practice playback voice.
- MIDI editor playback uses the same reliable scheduled-start pattern and routes the editor synth through the main audio bus.
- Imported multi-track MIDI is flattened consistently for the current single-lane piano-roll editor; applying edits clears old note tracks to prevent duplicate playback.

## 3. Recorder MIDI import
- `live-file-input` is now wired to the sequencer.
- Importing `.mid/.midi` loads notes from every track into Recorder state, including timing, duration, pitch, and velocity.
- Play, Edit, and Save enable immediately after a valid import.
- Imported Recorder files can be edited with the same editor and saved back as MIDI.
- Added a compact file/note-count status indicator in the Recorder panel.

## 4. True pixel resizing
- Removed the old column/row span model from the docking engine.
- Desktop dock sizes are stored as exact pixel width/height values.
- During resize, the floating panel follows the pointer continuously on every animation frame.
- The in-flow spacer and destination outline track the exact pixel dimensions; there is no grid-size preview or span conversion.
- On release, the exact size shown while dragging is persisted. Resize commit deliberately has no scale animation.
- Drag/reorder retains stable independent insertion guides and visible edge drop zones.

## Compatibility
All existing application IDs required by audio, MIDI, arranger, keyboard, sequencer, track player, and editor modules were preserved.
