# V11 validation

- All JavaScript modules pass `node --check`.
- HTML IDs are unique; all static `getElementById()` references resolve.
- All local ES module imports resolve.
- CSS brace structure is balanced.
- V11 Performance scroll overrides are ordered after the V10 fixed-console rules, so the console and panels return to normal workspace scrolling.
- The main keyboard pin control remains present and is the only sticky Performance content selector introduced by V11.
- Practice Scale controls and all Practice Accompaniment controls are present with unique IDs.
- Live/Practice scale and accompaniment controls are synchronized through shared state bindings in `main.js`.
- Manual Practice keyboard note routing can use the shared accompaniment engine; imported MIDI playback is not reharmonized.
