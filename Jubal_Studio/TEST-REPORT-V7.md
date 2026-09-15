# Jubal Studio V7 test report

## Static validation
- All JavaScript modules pass `node --check`.
- CSS brace balance is zero.
- Existing dock localStorage key and restore code remain present.

## Playback-rate scheduler test
A two-note synthetic playback sequence was scheduled with source events at 0.0 s and 1.0 s, each 0.2 s long, at 2x playback rate.

Observed:
- second note audio schedule offset: 0.500 s
- scheduled note duration: 0.100 s
- reported playback rate: 2.0

This verifies that tempo affects both event spacing and note duration rather than only changing a UI value.

## Scroll containment verification
The stylesheet now fixes `html` and `body` to the viewport with `overflow: hidden` and `overscroll-behavior: none`. The active view and intentional editor/workspace surfaces own scrolling locally with scroll chaining contained.
