# Jubal Studio V8 — Instrument UX & Theme Pass

## Instrument scroll protection
- Main keyboard and practice instrument surfaces can never become vertical scroll containers.
- Vertical touchpad/wheel gestures over keyboard/instrument surfaces are prevented from scrolling the workspace underneath.
- Horizontal gestures remain available for wide keyboards and practice visualizers.
- Touch interaction on instrument surfaces is restricted to horizontal panning.

## Compact controls
- Primary workspace tabs shortened to Live / Practice.
- MIDI Map shortened to MIDI.
- Layout lock/reset changed to compact symbol controls with accessible tooltips/ARIA labels.
- Recorder and Practice transport controls use icon-only Play/Stop/Record/Edit/Save buttons.
- Controller mode labels shortened to PADS · ARR / APP and KNOBS · SYN / APP.
- Arranger controls shortened to SYNC / RUN / FILL and IN / A / B / END.
- Metronome shortened to MET · ON/OFF.

## Harmony octave control
- Replaced separate “- OCT / + OCT” buttons with a segmented Zone Octave stepper.
- Zone range inputs are grouped visually with the octave stepper.
- Existing element IDs and behavior are preserved.

## Main keyboard proportions
- White keys: 40px × 240px (6:1 visible length/width).
- Black keys: 24px × 150px (60% white-key width, 62.5% white-key length).
- Existing keyboard generation geometry is unchanged, preserving MIDI/note hit alignment.

## Optional soft light theme
- Dark remains the default.
- Header theme button toggles dark/light.
- Theme preference persists in localStorage using `jubalStudioTheme`.
- Light theme uses muted cool grays/off-whites rather than full white to reduce glare.
- Major workstation, panel, controller, keyboard, modal, editor, and practice surfaces have light-theme overrides.
