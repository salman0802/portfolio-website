// 4. Accompaniment
// Converts keyboard note events into diatonic/inverted chord note arrays.
// It owns accompaniment zoning and chord detection, then hands note groups to Audio Core.

import { mainBus, getActiveVoices, playRoutedNotes, releaseRoutedNotes } from "./audio-core.js";
import { notesArray, scaleIntervals, getScaleState } from "./keyboard-scales.js";

let autoAccompanimentEnabled = true;
let activeAccompNotesMap = new Map();
let activeMouseAccompMap = new Map();

function getSafeMidi(noteStr, fallback) {
  const match = String(noteStr).match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return fallback;
  const idx = notesArray.indexOf(match[1]);
  return idx + (Number(match[2]) + 1) * 12;
}

export function getAccompanimentSettings() {
  return {
    enabled: autoAccompanimentEnabled,
    start: document.getElementById("accomp-zone-start")?.value || "C2",
    end: document.getElementById("accomp-zone-end")?.value || "B2",
    inversion: Number(document.getElementById("accomp-inversion")?.value || 0)
  };
}

export function setAutoAccompanimentEnabled(enabled) {
  autoAccompanimentEnabled = Boolean(enabled);
  const button = document.getElementById("accompaniment-toggle");
  if (button) {
    button.innerText = autoAccompanimentEnabled ? "ON" : "OFF";
    button.classList.toggle("active-toggle", autoAccompanimentEnabled);
  }
}

export function shiftAccompZone(octaves) {
  const shift = el => {
    const midi = getSafeMidi(el.value, 36);
    const nextMidi = midi + octaves * 12;
    const octave = Math.floor(nextMidi / 12) - 1;
    const pitch = notesArray[nextMidi % 12];
    el.value = `${pitch}${octave}`;
  };
  const start = document.getElementById("accomp-zone-start");
  const end = document.getElementById("accomp-zone-end");
  if (start && end) {
    shift(start);
    shift(end);
  }
  window.dispatchEvent(new CustomEvent("jubal:settingsChanged"));
}

export function getDiatonicChordsData() {
  const { root, type } = getScaleState();
  if (type === "none") return [];
  const rootIdx = notesArray.indexOf(root);
  const intervals = scaleIntervals[type] || [];
  const diatonicList = [];

  for (let i = 0; i < intervals.length; i++) {
    const semitone = (rootIdx + intervals[i]) % 12;
    const rootName = notesArray[semitone];
    let thirdOffset = (intervals[(i + 2) % intervals.length] - intervals[i] + 12) % 12;
    let fifthOffset = (intervals[(i + 4) % intervals.length] - intervals[i] + 12) % 12;

    if (type === "pentatonic") {
      const q = ["Major", "Minor", "Minor", "Major", "Minor"][i];
      thirdOffset = q === "Minor" ? 3 : 4;
      fifthOffset = 7;
    }

    let quality = "Other";
    if (thirdOffset === 4 && fifthOffset === 7) quality = "Major";
    else if (thirdOffset === 3 && fifthOffset === 7) quality = "Minor";
    else if (thirdOffset === 3 && fifthOffset === 6) quality = "Diminished";
    else if (thirdOffset === 4 && fifthOffset === 8) quality = "Augmented";

    diatonicList.push({ root: rootName, quality, name: `${rootName} ${quality}` });
  }
  return diatonicList;
}

export function updateDiatonicListDisplay(activeChordName = null) {
  const display = document.getElementById("live-chord-suggest");
  if (!display) return;
  const { root, type } = getScaleState();
  if (type === "none") {
    display.innerText = "Select a scale to view diatonic chords";
    return;
  }

  const names = getDiatonicChordsData().map(c => c.name).join(" / ");
  display.innerHTML = activeChordName
    ? `<b>Active:</b> ${activeChordName}<br><span style="font-size:0.75rem; color:var(--text-muted); line-height:1.6;">${names}</span>`
    : `<b>Diatonic Chords (${root}):</b><br><span style="font-size:0.75rem; color:var(--text-muted); line-height:1.6;">${names}</span>`;
}

export function detectChord(activeNotesArray) {
  if (!activeNotesArray || activeNotesArray.length < 3) return null;
  const midiBases = activeNotesArray.map(n => getSafeMidi(n, 0) % 12);
  const uniqueBases = [...new Set(midiBases)].sort((a, b) => a - b);
  if (uniqueBases.length < 3) return null;

  for (const root of uniqueBases) {
    const intervals = uniqueBases.map(b => (b - root + 12) % 12).sort((a, b) => a - b);
    const intStr = intervals.join(",");
    const rootName = notesArray[root];
    if (intStr.includes("0,4,7")) return `${rootName} Major`;
    if (intStr.includes("0,3,7")) return `${rootName} Minor`;
    if (intStr.includes("0,4,8")) return `${rootName} Augmented`;
    if (intStr.includes("0,3,6")) return `${rootName} Diminished`;
    if (intStr.includes("0,2,7")) return `${rootName} sus2`;
    if (intStr.includes("0,5,7")) return `${rootName} sus4`;
  }
  return null;
}

export function getAccompanimentNotes(midiNote) {
  const startMidi = getSafeMidi(document.getElementById("accomp-zone-start")?.value || "C2", 36);
  const endMidi = getSafeMidi(document.getElementById("accomp-zone-end")?.value || "B2", 59);
  const scale = getScaleState();

  if (!autoAccompanimentEnabled || scale.type === "none" || midiNote < startMidi || midiNote > endMidi) {
    return { notes: [midiToNote(midiNote)], isAccomp: false };
  }

  const rootIdx = notesArray.indexOf(scale.root);
  const intervals = scaleIntervals[scale.type] || [];
  const semitoneFromRoot = ((midiNote % 12) - rootIdx + 12) % 12;
  const scaleDegreeIdx = intervals.indexOf(semitoneFromRoot);
  if (scaleDegreeIdx === -1) return { notes: [midiToNote(midiNote)], isAccomp: false };

  let thirdOffset = (intervals[(scaleDegreeIdx + 2) % intervals.length] - intervals[scaleDegreeIdx] + 12) % 12;
  let fifthOffset = (intervals[(scaleDegreeIdx + 4) % intervals.length] - intervals[scaleDegreeIdx] + 12) % 12;

  if (scale.type === "pentatonic") {
    const q = ["Major", "Minor", "Minor", "Major", "Minor"][scaleDegreeIdx];
    thirdOffset = q === "Minor" ? 3 : 4;
    fifthOffset = 7;
  }

  const inversion = Number(document.getElementById("accomp-inversion")?.value || 0);
  const chordMidi = [midiNote, midiNote + thirdOffset, midiNote + fifthOffset];
  if (inversion === 1) chordMidi[0] += 12;
  if (inversion === 2) {
    chordMidi[0] += 12;
    chordMidi[1] += 12;
  }
  return { notes: chordMidi.map(midiToNote), isAccomp: true };
}

function midiToNote(midi) {
  const pitchClass = notesArray[((midi % 12) + 12) % 12];
  return `${pitchClass}${Math.floor(midi / 12) - 1}`;
}

export function getSmartAccompaniment(midiNote, primaryNoteName) {
  if (!autoAccompanimentEnabled) return { notes: [primaryNoteName], isAccomp: false };

  for (const notes of activeAccompNotesMap.values()) {
    if (notes.includes(primaryNoteName)) return { notes: [primaryNoteName], isAccomp: false };
  }
  for (const notes of activeMouseAccompMap.values()) {
    if (notes.includes(primaryNoteName)) return { notes: [primaryNoteName], isAccomp: false };
  }
  return getAccompanimentNotes(midiNote);
}

window.addEventListener("jubal:noteOn", e => {
  const { containerId, sourceId, midi: physicalMidi, note: physicalNote, velocity = 0.8 } = e.detail;
  const { activeLiveVoice, activeLearnVoice, activeAccompanimentVoice } = getActiveVoices();
  const isLive = containerId === "live-keyboard";
  const midi = isLive ? physicalMidi + Number(window.jubalLiveTranspose || 0) : physicalMidi;
  const note = isLive ? midiToNote(midi) : physicalNote;
  const primary = midiToNote(midi);

  if (isLive) {
    const chordResult = getSmartAccompaniment(midi, primary);
    const voice = chordResult.isAccomp ? activeAccompanimentVoice : activeLiveVoice;
    if (chordResult.isAccomp) activeMouseAccompMap.set(sourceId, chordResult.notes);

    playRoutedNotes({
      sourceId,
      notes: chordResult.notes,
      voice,
      velocity,
      source: "keyboard"
    });
    window.dispatchEvent(new CustomEvent("jubal:resolvedNoteOn", {
      detail: { sourceId, midi, note: primary, notes: chordResult.notes, isAccomp: chordResult.isAccomp, velocity, containerId }
    }));
  } else {
    playRoutedNotes({ sourceId, notes: [note], voice: activeLearnVoice, velocity, source: "keyboard" });
    window.dispatchEvent(new CustomEvent("jubal:resolvedNoteOn", {
      detail: { sourceId, midi, note, notes: [note], isAccomp: false, velocity, containerId }
    }));
  }
});

window.addEventListener("jubal:noteOff", e => {
  const { containerId, sourceId, midi, note } = e.detail;
  const route = releaseRoutedNotes(sourceId);
  if (containerId === "live-keyboard") activeMouseAccompMap.delete(sourceId);
  if (route) {
    window.dispatchEvent(new CustomEvent("jubal:resolvedNoteOff", {
      detail: { sourceId, midi, note, notes: route.notes, isAccomp: activeMouseAccompMap.has(sourceId), containerId }
    }));
  }
});

window.addEventListener("jubal:miniNoteOn", e => {
  const { sourceId, note } = e.detail;
  const { activeAccompanimentVoice } = getActiveVoices();
  const route = playRoutedNotes({
    sourceId,
    notes: [`${note}3`],
    voice: activeAccompanimentVoice,
    velocity: 0.8,
    source: "mini-viz"
  });
  setTimeout(() => {
    releaseRoutedNotes(sourceId);
  }, 250);
});

window.addEventListener("jubal:scaleChanged", () => updateDiatonicListDisplay());

window.addEventListener("jubal:requestAccompanimentState", e => {
  e.detail?.resolve?.(getAccompanimentSettings());
});

export function getAccompanimentState() {
  return { autoAccompanimentEnabled, ...getAccompanimentSettings() };
}
