// Shared visual-state adapter used by MIDI/keyboard and the Academy module.

const activeLiveNotesMap = new Map();
const activeLearnNotesMap = new Map();

export function modifyActiveLiveNote(note, isAdd) {
  modify(activeLiveNotesMap, note, isAdd);
}
export function modifyActiveLearnNote(note, isAdd) {
  modify(activeLearnNotesMap, note, isAdd);
}
function modify(map, note, add) {
  const count = map.get(note) || 0;
  if (add) map.set(note, count + 1);
  else if (count > 0) count === 1 ? map.delete(note) : map.set(note, count - 1);
}
export function clearLiveVisuals() {
  activeLiveNotesMap.clear();
  updateLiveVisuals();
}
export function clearLearnVisuals() {
  activeLearnNotesMap.clear();
  updateLearnVisuals();
}
export function getLiveNotes() { return activeLiveNotesMap; }
export function getLearnNotes() { return activeLearnNotesMap; }

function notePitch(name) {
  const match = String(name).match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return null;
  const map = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  return map[match[1]] + (Number(match[2]) + 1) * 12;
}

function chordGuess(names) {
  if (names.length < 3) return null;
  const pcs = [...new Set(names.map(notePitch).filter(Number.isInteger).map(n => n % 12))].sort((a,b)=>a-b);
  const labels = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  for (const root of pcs) {
    const ints = pcs.map(n => (n - root + 12) % 12).sort((a,b)=>a-b).join(",");
    const rootName = labels[root];
    if (ints.includes("0,4,7")) return `${rootName} Major`;
    if (ints.includes("0,3,7")) return `${rootName} Minor`;
  }
  return null;
}

export function updateLiveVisuals() {
  const notes = [...activeLiveNotesMap.keys()];
  const display = document.getElementById("live-note");
  if (display) display.innerText = chordGuess(notes) || (notes.length ? notes.join(" + ") : "--");

  document.querySelectorAll("#live-keyboard .key").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".mini-key").forEach(el => el.classList.remove("active"));

  notes.forEach(name => {
    const midi = notePitch(name);
    if (midi == null) return;
    const transpose = Number(window.jubalLiveTranspose || 0);
    const physical = midi - transpose;
    const pitchClass = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][physical % 12];
    const octave = Math.floor(physical / 12) - 1;
    document.getElementById(`live-keyboard-${pitchClass}${octave}`)?.classList.add("active");
    document.getElementById(`mini-viz-${name.replace(/[0-9]/g, "")}`)?.classList.add("active");
  });

  updateLiveChordText();
}

function updateLiveChordText() {
  window.dispatchEvent(new CustomEvent("jubal:refreshDiatonic"));
}

export function updateLearnVisuals() {
  const notes = [...activeLearnNotesMap.keys()];
  const display = document.getElementById("learn-note");
  if (display) display.innerText = chordGuess(notes) || (notes.length ? notes.join(" + ") : "--");

  const inst = document.getElementById("learn-instrument")?.value || "piano";
  if (inst === "piano") {
    document.querySelectorAll("#learn-keyboard .key").forEach(el => el.classList.remove("active"));
    notes.forEach(name => document.getElementById(`learn-keyboard-${name}`)?.classList.add("active"));
  }
}

window.addEventListener("jubal:resolvedNoteOn", e => {
  const { notes, containerId } = e.detail;
  const isLive = containerId === "live-keyboard";
  notes.forEach(note => modify(isLive ? activeLiveNotesMap : activeLearnNotesMap, note, true));
  if (isLive) updateLiveVisuals(); else updateLearnVisuals();
});
window.addEventListener("jubal:resolvedNoteOff", e => {
  const { notes, containerId } = e.detail;
  const isLive = containerId === "live-keyboard";
  const map = isLive ? activeLiveNotesMap : activeLearnNotesMap;
  notes.forEach(note => modify(map, note, false));
  if (isLive) updateLiveVisuals(); else updateLearnVisuals();
});
window.addEventListener("jubal:recordVisualOn", e => e.detail.notes?.forEach(note => modifyActiveLiveNote(note, true)));
window.addEventListener("jubal:recordVisualOff", e => e.detail.notes?.forEach(note => modifyActiveLiveNote(note, false)));
window.addEventListener("jubal:clearLiveVisuals", clearLiveVisuals);
window.addEventListener("jubal:clearLearnVisuals", clearLearnVisuals);
