// 7. Hardware & MIDI
// Hardware mappings are translated into custom application events so the UI
// does not depend on MIDI controller-specific definitions.

export const DEFAULT_MIDI_MAP = {
  masterVolume: { type: "cc", id: null }, tempo: { type: "cc", id: null },
  loopStart: { type: "cc", id: null }, loopLength: { type: "cc", id: null },
  padModeToggle: { type: "note", id: null },
  arrSync: { type: "note", id: null }, arrStart: { type: "note", id: null },
  arrIntro: { type: "note", id: null }, arrMainA: { type: "note", id: null },
  arrMainB: { type: "note", id: null }, arrFill: { type: "note", id: null }, arrEnding: { type: "note", id: null },
  playStop: { type: "note", id: null }, record: { type: "note", id: null },
  transUp: { type: "note", id: null }, transDown: { type: "note", id: null },
  octUp: { type: "note", id: null }, octDown: { type: "note", id: null },
  accompToggle: { type: "note", id: null }
};

export const actionNames = {
  masterVolume: "Master Vol", tempo: "Tempo", loopStart: "Loop Start", loopLength: "Loop Len",
  padModeToggle: "MODE TOGGLE", arrSync: "Sync Start", arrStart: "Arr Start", arrIntro: "Intro",
  arrMainA: "Main A", arrMainB: "Main B", arrFill: "Fill In", arrEnding: "Ending",
  playStop: "Play / Stop", record: "Record", transDown: "Trans -", transUp: "Trans +",
  octDown: "Octave -", octUp: "Octave +", accompToggle: "Accomp Tgl"
};

export const arrangerPadMappings = ["arrSync", "arrStart", "arrIntro", "arrMainA", "arrMainB", "arrFill", "arrEnding", "padModeToggle"];
export const appPadMappings = ["playStop", "record", "transDown", "transUp", "octDown", "octUp", "accompToggle", "padModeToggle"];
export const appKnobMappings = ["masterVolume", "tempo", "loopStart", "loopLength"];

let midiMap = structuredClone(DEFAULT_MIDI_MAP);
let access = null;
let isListeningForMidi = false;
let activeListenTarget = null;

export function getMidiMap() {
  return midiMap;
}

export function setMidiMap(next) {
  midiMap = { ...structuredClone(DEFAULT_MIDI_MAP), ...next };
  renderMidiMapUI();
  updateHardwareUI();
}

function emitControl(actionKey, value = null) {
  window.dispatchEvent(new CustomEvent("jubal:midiControl", {
    detail: { actionKey, value }
  }));
}

function flashPad(actionKey) {
  const padMap = document.getElementById("pads-toggle")?.parentElement?.parentElement?.querySelectorAll(".drum-pad");
  const index = [...arrangerPadMappings, ...appPadMappings].findIndex(x => x === actionKey);
  const pad = document.getElementById("drum-pad-grid")?.children[
    (document.getElementById("pads-toggle")?.innerText.includes("ARRANGER") ? arrangerPadMappings : appPadMappings).indexOf(actionKey)
  ];
  if (pad) {
    pad.classList.add("active");
    setTimeout(() => pad.classList.remove("active"), 100);
  }
  void padMap; void index;
}

export function renderMidiMapUI() {
  Object.entries(midiMap).forEach(([key, mapping]) => {
    const input = document.getElementById(`input-${key}`);
    if (input) input.value = mapping.id ?? "";
  });
}

export function updateHardwareUI({ currentPadMode = "arranger", knobModeSynth = true } = {}) {
  const padGrid = document.getElementById("drum-pad-grid");
  if (padGrid) {
    const mappings = currentPadMode === "arranger" ? arrangerPadMappings : appPadMappings;
    [...padGrid.children].forEach((pad, index) => {
      const actionKey = mappings[index];
      const mapping = midiMap[actionKey];
      if (!mapping) return;
      const display = mapping.id !== null
        ? `[${mapping.type === "cc" ? "C" : "N"}${mapping.id}]`
        : "[--]";
      pad.innerHTML = `${actionNames[actionKey]}<br><span style="font-size:0.4rem; color:var(--text-muted);">${display}</span>`;
      pad.style.color = mapping.id !== null ? (index === 7 ? "var(--accent-gold)" : "var(--accent-cyan)") : "#475569";
      pad.style.borderColor = mapping.id !== null ? (index === 7 ? "var(--accent-gold)" : "var(--accent-cyan)") : "#1e293b";
      pad.style.background = index === 7 && mapping.id !== null ? "rgba(255, 215, 0, 0.08)" : (mapping.id !== null ? "rgba(0, 229, 255, 0.05)" : "");
    });
  }

  const synthLabels = ["Filter", "Reso", "Rev Size", "Rev Mix", "Dly Time", "Dly Fbk", "Chorus", "Master"];
  for (let i = 0; i < 8; i++) {
    const label = document.getElementById(`lbl-knob-${i}`);
    const knob = document.getElementById(`knob-${i}`);
    if (!label || !knob) continue;
    if (knobModeSynth) {
      label.innerText = synthLabels[i];
      knob.style.borderColor = "var(--accent-cyan)";
    } else if (i < appKnobMappings.length) {
      const key = appKnobMappings[i];
      const mapping = midiMap[key];
      label.innerText = actionNames[key] + (mapping.id !== null ? ` [C${mapping.id}]` : " [--]");
      knob.style.borderColor = mapping.id !== null ? "var(--accent-gold)" : "#334155";
    } else {
      label.innerText = "--";
      knob.style.borderColor = "#334155";
    }
  }
}

export function startListen(targetKey, type) {
  if (!midiMap[targetKey]) return;
  isListeningForMidi = true;
  activeListenTarget = targetKey;
  const btn = document.getElementById(`listen-${targetKey}`);
  if (btn) {
    btn.classList.add("listening");
    btn.innerText = "Listening...";
  }
  window.dispatchEvent(new CustomEvent("jubal:midiListenState", { detail: { targetKey, type, listening: true } }));
}

export function cancelMidiListen() {
  if (activeListenTarget) {
    const btn = document.getElementById(`listen-${activeListenTarget}`);
    if (btn) {
      btn.classList.remove("listening");
      btn.innerText = "🎧 Listen";
    }
  }
  isListeningForMidi = false;
  activeListenTarget = null;
}

export function updateMidiMap(key, type, value) {
  const num = Number.parseInt(value);
  midiMap[key] = { type, id: Number.isFinite(num) && num >= 0 && num <= 127 ? num : null };
  renderMidiMapUI();
  updateHardwareUI();
  window.dispatchEvent(new CustomEvent("jubal:settingsChanged"));
}

export function clearMidiMap() {
  Object.keys(midiMap).forEach(key => midiMap[key].id = null);
  renderMidiMapUI();
  updateHardwareUI();
  window.dispatchEvent(new CustomEvent("jubal:settingsChanged"));
}

export function closeMidiMapModal() {
  document.getElementById("midi-map-modal")?.style.setProperty("display", "none");
  cancelMidiListen();
}

export function openMidiMapModal() {
  document.getElementById("midi-map-modal")?.style.setProperty("display", "flex");
  renderMidiMapUI();
}

export async function initMIDI() {
  if (!navigator.requestMIDIAccess) {
    document.getElementById("midi-text")?.replaceChildren(document.createTextNode("MIDI Unavailable"));
    return;
  }
  try {
    access = await navigator.requestMIDIAccess();
    const updateStatus = () => {
      const hasInputs = [...access.inputs.values()].some(input => input.state === "connected");
      const text = document.getElementById("midi-text");
      const dot = document.getElementById("midi-dot");
      if (text) text.innerText = hasInputs ? "MIDI: Active" : "MIDI: Offline";
      if (dot) dot.className = hasInputs ? "status-dot active" : "status-dot";
    };
    updateStatus();
    access.onstatechange = updateStatus;
    access.inputs.forEach(input => input.onmidimessage = processMIDI);
  } catch {
    document.getElementById("midi-text")?.replaceChildren(document.createTextNode("MIDI Blocked"));
  }
}

export function processMIDI(event) {
  const data = [...event.data];
  const status = data[0] || 0;
  const data1 = data[1] || 0;
  const data2 = data[2] || 0;
  const cmd = status & 0xf0;
  const velocity = data2 / 127;

  if (isListeningForMidi && activeListenTarget && (cmd === 0xb0 || cmd === 0x90)) {
    midiMap[activeListenTarget] = { type: cmd === 0xb0 ? "cc" : "note", id: data1 };
    renderMidiMapUI();
    updateHardwareUI();
    cancelMidiListen();
    window.dispatchEvent(new CustomEvent("jubal:settingsChanged"));
    return;
  }

  if (cmd === 0xb0) {
    for (const [key, mapping] of Object.entries(midiMap)) {
      if (mapping.type === "cc" && mapping.id === data1) {
        emitControl(key, data2);
        flashPad(key);
      }
    }

    if (data1 >= 70 && data1 <= 77) {
      window.dispatchEvent(new CustomEvent("jubal:synthCC", { detail: { cc: data1, value: data2 } }));
    }
    return;
  }

  if (cmd === 0x90 && velocity > 0) {
    let handled = false;
    for (const [key, mapping] of Object.entries(midiMap)) {
      if (mapping.type === "note" && mapping.id === data1) {
        emitControl(key);
        flashPad(key);
        handled = true;
      }
    }
    if (handled) return;
  }

  // Musical MIDI note input is separated from mapping controls.
  if (cmd === 0x90 || cmd === 0x80) {
    window.dispatchEvent(new CustomEvent(cmd === 0x90 && velocity > 0 ? "jubal:midiNoteOn" : "jubal:midiNoteOff", {
      detail: { midi: data1, velocity, channel: status & 0x0f }
    }));
  }
}
