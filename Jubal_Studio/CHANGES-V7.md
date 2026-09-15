# Jubal Studio V7 changes

## Touchpad / page scroll containment
- Converted the document shell to a fixed-height desktop-app layout (`html`/`body` no longer scroll).
- Disabled browser overscroll/bounce and scroll chaining with `overscroll-behavior`.
- The active workspace is the intentional vertical scroll surface; piano roll, dock contents, keyboard dock and academy scroller keep local scrolling without handing momentum back to the browser page.
- Removed smooth-scroll behavior from workstation surfaces so trackpad movement feels direct rather than animated.

## Practice Player tempo
- Added native playback-rate support to the dedicated MIDI playback engine.
- Musical position advances at the selected rate while audio scheduling and note durations are scaled correctly.
- Tempo can be changed while a file is already playing without restarting the song.
- Practice Player reads the MIDI file's first tempo event as its reference BPM.
- Loading a MIDI file updates the Practice tempo display to the file tempo.
- Changing the Practice tempo slider now emits `jubal:tempoChanged`, which updates the file player's playback rate.
- MIDI-mapped/global tempo changes use the same event path.

## Preserved behavior
- Dock layout persistence remains on `jubalStudioDockLayoutV4`; panel order, exact pixel size, visibility and position metadata continue to be restored from localStorage.
- Live MIDI still uses immediate audio triggering; the Practice Player continues using the dedicated scheduler.
