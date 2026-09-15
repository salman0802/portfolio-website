# V6 Test Report

## Static checks
- Every JavaScript module passes `node --check`.
- All local ES module imports resolve.
- HTML contains 185 IDs and all 185 are unique.
- Every static `getElementById()` reference resolves to an HTML ID.
- CSS brace balance: 0.
- Practice, Recorder, and MIDI Editor contain no `Tone.Part` or `Tone.Transport.start()` playback path.

## Playback-engine timing test
Test MIDI events:
- note 1 at 0.00 s, duration 0.05 s
- note 2 at 0.08 s, duration 0.05 s

Result:
- 2/2 audio events scheduled.
- 2/2 visual note-on callbacks fired.
- 2/2 visual note-off callbacks fired.
- player reached end state at 0.15 s.

## Practice module integration test
Using a mocked two-note MIDI file:
- file parsed successfully;
- Play became available;
- 2/2 synth trigger calls generated;
- player reached stopped state after playback.

## Recorder module integration test
Using the same mocked file:
- import produced 2 recorder notes;
- status updated to `test.mid · 2 notes`;
- 2/2 synth trigger calls generated;
- player reached stopped state after playback.

## Workspace persistence checks
Source validation confirms V4 layout state contains:
- panel order;
- exact pixel width and height;
- hidden state;
- layout-lock state;
- logical x/y/index position metadata;
- unload/page-hide persistence hooks;
- migration from previous V3/V2 layout keys.

## Hardware/browser note
Physical speaker output, a specific MIDI controller, OS audio buffers, and browser autoplay policy cannot be measured in this container. The failing shared Transport playback dependency has been removed, and module-level note scheduling/output has been exercised with deterministic tests.
