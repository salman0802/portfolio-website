// 3. Keyboard & Scales
// Pure UI/input layer: never calls Tone.js. It only emits application events.

export const notesArray = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const scaleIntervals = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  pentatonic: [0, 2, 4, 7, 9],
  yaman: [0, 2, 4, 6, 7, 9, 11],
  bhairav: [0, 1, 4, 5, 7, 8, 11],
  bhairavi: [0, 1, 3, 5, 7, 8, 10],
  malkauns: [0, 3, 5, 8, 10],
  darbari_kanada: [0, 2, 3, 5, 7, 8, 10],
  bhimpalasi: [0, 2, 3, 5, 7, 9, 10],
  jaunpuri: [0, 2, 3, 5, 7, 8, 10],
  ahir_bhairav: [0, 1, 4, 5, 7, 9, 10],
  bihag: [0, 2, 4, 5, 6, 7, 9, 11],
  miyan_malhar: [0, 2, 3, 5, 7, 9, 10, 11],
  hamsadhwani: [0, 2, 4, 7, 11],
  mohanam: [0, 2, 4, 7, 9],
  kalyani: [0, 2, 4, 6, 7, 9, 11],
  sankarabharanam: [0, 2, 4, 5, 7, 9, 11],
  kharaharapriya: [0, 2, 3, 5, 7, 9, 10],
  todi: [0, 1, 3, 5, 7, 8, 10],
  abheri: [0, 2, 3, 5, 7, 9, 10],
  kalyani_vasantham: [0, 2, 3, 6, 7, 9, 11],
  c_bhairavi: [0, 2, 3, 5, 7, 8, 9, 10],
  anandabhairavi: [0, 2, 3, 5, 7, 8, 9, 10]
};

let currentScaleRoot = "D";
let currentScaleType = "major";
export const currentScaleNotes = new Set();

export function getScaleState() {
  return { root: currentScaleRoot, type: currentScaleType, notes: new Set(currentScaleNotes) };
}

export function setScaleState(root, type) {
  currentScaleRoot = root;
  currentScaleType = type;
  updateScaleHighlight();
}

function noteToMidi(noteName, octave) {
  return notesArray.indexOf(noteName) + (Number(octave) + 1) * 12;
}

function emit(type, detail) {
  window.dispatchEvent(new CustomEvent(`jubal:${type}`, { detail }));
}

function emitNote(containerId, noteStr, octave, isDown) {
  const midi = noteToMidi(noteStr, octave);
  emit(isDown ? "noteOn" : "noteOff", {
    midi,
    note: `${noteStr}${octave}`,
    pitchClass: noteStr,
    octave,
    containerId,
    source: containerId === "live-keyboard" ? "live-keyboard" : "learn-keyboard",
    sourceId: `${containerId}:${noteStr}${octave}`
  });
}

export function updateScaleHighlight() {
  const rootEl = document.getElementById("scale-root");
  const typeEl = document.getElementById("scale-type");
  if (rootEl) currentScaleRoot = rootEl.value;
  if (typeEl) currentScaleType = typeEl.value;
  currentScaleNotes.clear();

  document.querySelectorAll(".key.in-scale").forEach(el => el.classList.remove("in-scale"));
  if (currentScaleType === "none") {
    emit("scaleChanged", getScaleState());
    return;
  }

  const rootIndex = notesArray.indexOf(currentScaleRoot);
  const intervals = scaleIntervals[currentScaleType] || [];
  intervals.forEach(interval => currentScaleNotes.add(notesArray[(rootIndex + interval) % 12]));

  ["live-keyboard", "learn-keyboard"].forEach(containerId => {
    document.querySelectorAll(`#${containerId} .key`).forEach(key => {
      if (currentScaleNotes.has(key.dataset.note)) key.classList.add("in-scale");
    });
  });
  emit("scaleChanged", getScaleState());
}

export function buildKeyboard(containerId, baseOctave = 2, numKeys = 61) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  let currentX = 0;
  let noteIdx = 0;
  let oct = baseOctave;

  for (let i = 0; i < numKeys; i++) {
    const noteStr = notesArray[noteIdx];
    const isBlack = noteStr.includes("#");
    const key = document.createElement("div");
    key.className = `key ${isBlack ? "black" : "white"}`;
    key.id = `${containerId}-${noteStr}${oct}`;
    key.dataset.note = noteStr;
    key.dataset.octave = String(oct);

    key.style.left = `${isBlack ? currentX - 12 : currentX}px`;
    if (!isBlack) {
      currentX += 40;
      if (noteStr === "C") {
        const label = document.createElement("div");
        label.className = "key-label";
        label.innerText = `C${oct}`;
        key.appendChild(label);
      }
    }

    const keyOctave = oct;
    key.addEventListener("mousedown", e => {
      e.preventDefault();
      emitNote(containerId, noteStr, keyOctave, true);
    });
    key.addEventListener("mouseup", e => {
      e.preventDefault();
      emitNote(containerId, noteStr, keyOctave, false);
    });
    key.addEventListener("mouseleave", e => emitNote(containerId, noteStr, keyOctave, false));
    container.appendChild(key);

    noteIdx++;
    if (noteIdx >= 12) {
      noteIdx = 0;
      oct++;
    }
  }

  container.style.width = `${currentX}px`;
  updateScaleHighlight();
}

export function buildMiniViz() {
  const container = document.getElementById("mini-accomp-viz");
  if (!container) return;
  container.innerHTML = "";
  let currentX = 0;

  notesArray.forEach(noteStr => {
    const isBlack = noteStr.includes("#");
    const key = document.createElement("div");
    key.className = `mini-key ${isBlack ? "black" : "white"}`;
    key.id = `mini-viz-${noteStr}`;
    key.dataset.note = noteStr;
    key.style.left = `${isBlack ? currentX - 12 : currentX}px`;

    if (!isBlack) currentX += 40;
    key.addEventListener("mousedown", e => {
      e.preventDefault();
      emit("miniNoteOn", { note: noteStr, octave: 3, midi: noteToMidi(noteStr, 3), sourceId: `mini:${noteStr}` });
      setTimeout(() => emit("miniNoteOff", { note: noteStr, octave: 3, midi: noteToMidi(noteStr, 3), sourceId: `mini:${noteStr}` }), 250);
    });
    container.appendChild(key);
  });

  container.style.width = `${currentX}px`;
}
