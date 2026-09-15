# Jubal Studio V6 — Playback + Persistent Workspace

## 1. Persistent component positions
- Dock state now uses `jubalStudioDockLayoutV4`.
- Saves panel order, width, height, hidden state, lock state, and logical position metadata (`index`, `x`, `y`).
- Saves after drag, resize, hide/show, layout lock changes, and workspace clamping.
- Also saves on `pagehide`, `beforeunload`, and when the document becomes hidden.
- Automatically migrates V3/V2 dock layouts forward instead of discarding the user's existing layout.

## 2. MIDI playback architecture
The Practice player, Performance Recorder playback, and MIDI Editor no longer rely on `Tone.Transport`/`Tone.Part` for note playback.

A new `playback-engine.js` provides a small audio-clock look-ahead scheduler that:
- schedules notes directly against the Web Audio/Tone clock;
- keeps live MIDI latency independent from file playback scheduling;
- supports play, pause, stop, seek, and loops;
- keeps visual note-on/note-off events synchronized;
- makes timeline players mutually exclusive so two imported sources cannot fight each other.

## 3. Audio context handling
- Removed the custom global `new Tone.Context(...)` replacement.
- Uses Tone.js' normal browser context.
- Live key/MIDI events still use `Tone.immediate()`.
- `ensureToneStarted()` now also resumes the underlying raw AudioContext when required.

## 4. Practice & Player
- Imported MIDI playback uses the new scheduler.
- Notes now trigger the selected Practice voice directly.
- Keyboard note-on/note-off visualization stays synchronized with playback.
- Timeline seek and loop selection use the dedicated player rather than the global Transport.

## 5. Performance Recorder
- Imported and recorded notes use the same playback scheduler.
- Imported MIDI continues to enable Play, Edit, and Save.
- Performance keyboard visualization is driven from the playback events.

## 6. MIDI Editor
- Editor playback uses the same tested scheduler as the other MIDI workflows.
- Editor loop/seek/playhead state no longer depends on global Transport playback state.
- Tempo is still read from the global BPM value for musical grid/snap calculations only.

## 7. Global controls
- Spacebar and mapped Play/Stop actions now query the actual Practice/Recorder/Editor player state instead of `Tone.Transport.state`.
