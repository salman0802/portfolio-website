# Jubal Studio — Modular Architecture

This refactor splits the original single-file application into independent browser ES modules.

## Modules
- `styles.css` — all CSS formerly inside `<style>`.
- `ui.js` — view switching, panel visibility and browser localStorage helpers.
- `audio-core.js` — one shared Tone.js audio graph, shared `voices`, effects, bus and routing.
- `keyboard-scales.js` — scale intervals, keyboard rendering/highlighting and custom note events; no Tone.js calls.
- `accompaniment.js` — accompaniment zoning, diatonic chord construction, inversions and chord detection.
- `arranger.js` — arranger styles and a private scheduler state.
- `sequencer.js` — live recording/playback and MIDI file export using `@tonejs/midi`.
- `midi.js` — Web MIDI initialization, hardware mapping and MIDI-to-application events.
- `midi-editor.js` — reusable piano-roll rendering, ruler and note editing.
- `track-player.js` — imported MIDI, timeline, loop selection and `Tone.Part` playback.
- `academy-visualizer.js` — waterfall, pitch detection and recorder/bansuri SVG overlay; microphone uses a separate Web Audio context.
- `main.js` — application composition root; only coordinates cross-module state and UI wiring.
- `main-visuals.js` — small shared visual-state adapter for active live/learning notes.

## Run
Serve this folder from a local web server because browser ES modules and microphone/MIDI permissions are restricted in `file://` contexts.

For example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

The external Tone.js and `@tonejs/midi` CDN scripts are kept in `index.html`.
