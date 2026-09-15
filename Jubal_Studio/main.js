// Main application composition root.
// The feature modules own their domain logic; this file only coordinates cross-module UI state.

import { bindUiEvents, saveSettings, loadSettings, switchView } from "./ui.js";
import {
  voices, mainBus, metronomeSynth, ensureToneStarted, getActiveVoices,
  setActiveLiveVoice, setActiveLearnVoice, setActiveAccompanimentVoice,
  handleSynthCC
} from "./audio-core.js";
import {
  buildKeyboard, buildMiniViz, updateScaleHighlight, setScaleState
} from "./keyboard-scales.js";
import {
  shiftAccompZone, setAutoAccompanimentEnabled, getAccompanimentState,
  updateDiatonicListDisplay
} from "./accompaniment.js";
import {
  bindArrangerUI, startArranger, stopArranger, toggleArrangerSync,
  triggerFill, selectArrangerSection
} from "./arranger.js";
import {
  bindSequencerUI, toggleRecording, playRecording, stopRecordingPlayback, isRecordingPlaybackActive
} from "./sequencer.js";
import {
  initMIDI, processMIDI, getMidiMap, setMidiMap, updateMidiMap,
  clearMidiMap, openMidiMapModal, closeMidiMapModal, startListen,
  arrangerPadMappings, appPadMappings, appKnobMappings, updateHardwareUI
} from "./midi.js";
import {
  bindMidiEditorUI, closeEditor, isEditorPlaying
} from "./midi-editor.js";
import {
  bindTrackPlayerUI, getTimelineState, getFileMidi, setTimelineLoop, stopFile, playFile, isFilePlaying
} from "./track-player.js";
import { bindAcademyVisualizer } from "./academy-visualizer.js";
import {
  getLiveNotes, getLearnNotes, clearLiveVisuals, clearLearnVisuals,
  updateLiveVisuals, updateLearnVisuals
} from "./main-visuals.js";

let liveBaseOctave = 2;
let liveTranspose = 0;
const learnBaseOctave = 2;
let liveKeyCount = 61;
let currentPadMode = "arranger";
let knobModeSynth = true;
let autoAccompanimentEnabled = true;
let metronomeRunning = false;

window.jubalLearnBaseOctave = learnBaseOctave;
window.jubalLiveTranspose = liveTranspose;
window.jubalGetFileMidi = getFileMidi;
window.jubalProcessMIDI = processMIDI;

function refreshGlobals() {
  window.jubalLearnBaseOctave = learnBaseOctave;
  window.jubalLiveTranspose = liveTranspose;
}

const CONTROL_MIRRORS = {
  "scale-root": "learn-scale-root",
  "scale-type": "learn-scale-type",
  "accomp-voice-select": "learn-accomp-voice-select",
  "accomp-zone-start": "learn-accomp-zone-start",
  "accomp-zone-end": "learn-accomp-zone-end",
  "accomp-inversion": "learn-accomp-inversion"
};

function setMirroredValue(primaryId, value) {
  const primary = document.getElementById(primaryId);
  const mirror = document.getElementById(CONTROL_MIRRORS[primaryId]);
  if (primary && value !== undefined && value !== null) primary.value = value;
  if (mirror && value !== undefined && value !== null) mirror.value = value;
}

function mirrorControlValue(sourceId, targetId) {
  const source = document.getElementById(sourceId);
  const target = document.getElementById(targetId);
  if (source && target) target.value = source.value;
}

function syncPracticeHarmonyFromLive() {
  Object.entries(CONTROL_MIRRORS).forEach(([primaryId, mirrorId]) => mirrorControlValue(primaryId, mirrorId));
}

function bindMirroredControl(primaryId, mirrorId, eventName, onChange) {
  const bind = (sourceId, targetId) => {
    document.getElementById(sourceId)?.addEventListener(eventName, e => {
      const target = document.getElementById(targetId);
      if (target) target.value = e.currentTarget.value;
      onChange?.(e.currentTarget.value, e);
      saveAppSettings();
    });
  };
  bind(primaryId, mirrorId);
  bind(mirrorId, primaryId);
}

function shiftSharedAccompZone(octaves) {
  shiftAccompZone(octaves);
  syncPracticeHarmonyFromLive();
  saveAppSettings();
}

function saveAppSettings() {
  saveSettings({
    scaleRoot: document.getElementById("scale-root")?.value,
    scaleType: document.getElementById("scale-type")?.value,
    accompStart: document.getElementById("accomp-zone-start")?.value,
    accompEnd: document.getElementById("accomp-zone-end")?.value,
    accompEnabled: autoAccompanimentEnabled,
    accompVoice: document.getElementById("accomp-voice-select")?.value,
    accompInversion: document.getElementById("accomp-inversion")?.value || "0",
    padMode: currentPadMode,
    knobModeSynth,
    liveVoice: document.getElementById("live-voice")?.value,
    liveOctave: liveBaseOctave,
    liveTranspose,
    liveTempo: document.getElementById("live-tempo")?.value,
    learnInstrument: document.getElementById("learn-instrument")?.value,
    learnTempo: document.getElementById("learn-tempo")?.value,
    keyboardSize: liveKeyCount,
    midiMap: getMidiMap()
  });
}

function applySettings(settings) {
  if (!settings) return;

  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.value = value;
  };

  setMirroredValue("scale-root", settings.scaleRoot);
  setMirroredValue("scale-type", settings.scaleType);
  setMirroredValue("accomp-zone-start", settings.accompStart);
  setMirroredValue("accomp-zone-end", settings.accompEnd);
  setMirroredValue("accomp-voice-select", settings.accompVoice);
  setMirroredValue("accomp-inversion", settings.accompInversion);
  setValue("live-voice", settings.liveVoice);
  setValue("learn-instrument", settings.learnInstrument);
  setValue("keyboard-size-select", settings.keyboardSize);

  if (settings.accompEnabled !== undefined) {
    autoAccompanimentEnabled = Boolean(settings.accompEnabled);
    setAutoAccompanimentEnabled(autoAccompanimentEnabled);
  }
  if (settings.padMode) currentPadMode = settings.padMode;
  if (settings.knobModeSynth !== undefined) knobModeSynth = Boolean(settings.knobModeSynth);

  if (settings.liveOctave !== undefined) liveBaseOctave = Number(settings.liveOctave);
  if (settings.liveTranspose !== undefined) liveTranspose = Number(settings.liveTranspose);
  if (settings.keyboardSize !== undefined) liveKeyCount = Number(settings.keyboardSize);

  const tempo = settings.liveTempo || settings.learnTempo;
  if (tempo !== undefined) {
    Tone.Transport.bpm.value = Number(tempo);
    const liveTempo = document.getElementById("live-tempo");
    const learnTempo = document.getElementById("learn-tempo");
    const liveVal = document.getElementById("live-tempo-val");
    const learnVal = document.getElementById("learn-tempo-val");
    if (liveTempo) liveTempo.value = tempo;
    if (learnTempo) learnTempo.value = settings.learnTempo || tempo;
    if (liveVal) liveVal.innerText = tempo;
    if (learnVal) learnVal.innerText = settings.learnTempo || tempo;
  }

  if (settings.midiMap) setMidiMap(settings.midiMap);
  setActiveLiveVoice(settings.liveVoice || "grand");
  setActiveAccompanimentVoice(settings.accompVoice || "warm-ep");
  setActiveLearnVoice(settings.learnInstrument && voices[settings.learnInstrument] ? settings.learnInstrument : "grand");

  const octaveEl = document.getElementById("octave-val");
  const transEl = document.getElementById("trans-val");
  const padEl = document.getElementById("pads-toggle");
  const knobEl = document.getElementById("knob-mode-toggle");
  if (octaveEl) octaveEl.innerText = liveBaseOctave;
  if (transEl) transEl.innerText = liveTranspose > 0 ? `+${liveTranspose}` : liveTranspose;
  if (padEl) {
    padEl.dataset.mode = currentPadMode;
    padEl.innerText = `PADS · ${currentPadMode === "arranger" ? "ARR" : "APP"}`;
  }
  if (knobEl) {
    knobEl.dataset.mode = knobModeSynth ? "synth" : "app";
    knobEl.innerText = `KNOBS · ${knobModeSynth ? "SYN" : "APP"}`;
  }

  syncPracticeHarmonyFromLive();
  refreshGlobals();
}

function bindVoiceAndPanelControls() {
  bindMirroredControl("accomp-voice-select", "learn-accomp-voice-select", "change", value => {
    setActiveAccompanimentVoice(value);
  });

  document.getElementById("live-voice")?.addEventListener("change", e => {
    setActiveLiveVoice(e.target.value);
    saveAppSettings();
  });

  document.getElementById("learn-instrument")?.addEventListener("change", e => {
    const instrument = e.target.value;
    setActiveLearnVoice(instrument === "piano" ? "grand" : instrument);
    saveAppSettings();
  });

  document.getElementById("btn-oct-up")?.addEventListener("click", () => {
    if (liveBaseOctave >= 5) return;
    liveBaseOctave++;
    document.getElementById("octave-val").innerText = liveBaseOctave;
    buildKeyboard("live-keyboard", liveBaseOctave, liveKeyCount);
    if (autoAccompanimentEnabled) shiftSharedAccompZone(1);
    refreshGlobals();
    saveAppSettings();
  });

  document.getElementById("btn-oct-down")?.addEventListener("click", () => {
    if (liveBaseOctave <= 1) return;
    liveBaseOctave--;
    document.getElementById("octave-val").innerText = liveBaseOctave;
    buildKeyboard("live-keyboard", liveBaseOctave, liveKeyCount);
    if (autoAccompanimentEnabled) shiftSharedAccompZone(-1);
    refreshGlobals();
    saveAppSettings();
  });

  document.getElementById("btn-trans-up")?.addEventListener("click", () => {
    if (liveTranspose >= 12) return;
    liveTranspose++;
    document.getElementById("trans-val").innerText = `+${liveTranspose}`;
    refreshGlobals();
    saveAppSettings();
  });

  document.getElementById("btn-trans-down")?.addEventListener("click", () => {
    if (liveTranspose <= -12) return;
    liveTranspose--;
    document.getElementById("trans-val").innerText = liveTranspose > 0 ? `+${liveTranspose}` : liveTranspose;
    refreshGlobals();
    saveAppSettings();
  });

  document.getElementById("btn-accomp-oct-up")?.addEventListener("click", () => shiftSharedAccompZone(1));
  document.getElementById("btn-accomp-oct-down")?.addEventListener("click", () => shiftSharedAccompZone(-1));
  document.getElementById("btn-learn-accomp-oct-up")?.addEventListener("click", () => shiftSharedAccompZone(1));
  document.getElementById("btn-learn-accomp-oct-down")?.addEventListener("click", () => shiftSharedAccompZone(-1));

  ["accompaniment-toggle", "learn-accompaniment-toggle"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => {
      autoAccompanimentEnabled = !autoAccompanimentEnabled;
      setAutoAccompanimentEnabled(autoAccompanimentEnabled);
      saveAppSettings();
    });
  });

  bindMirroredControl("accomp-zone-start", "learn-accomp-zone-start", "change");
  bindMirroredControl("accomp-zone-end", "learn-accomp-zone-end", "change");
  bindMirroredControl("accomp-inversion", "learn-accomp-inversion", "change");

  document.getElementById("keyboard-size-select")?.addEventListener("change", e => {
    liveKeyCount = Number(e.target.value);
    buildKeyboard("live-keyboard", liveBaseOctave, liveKeyCount);
    saveAppSettings();
  });

  bindMirroredControl("scale-root", "learn-scale-root", "change", () => updateScaleHighlight());
  bindMirroredControl("scale-type", "learn-scale-type", "change", () => updateScaleHighlight());

  document.getElementById("live-tempo")?.addEventListener("input", e => {
    const bpm = Number(e.target.value);
    Tone.Transport.bpm.value = bpm;
    document.getElementById("live-tempo-val").innerText = bpm;
    document.getElementById("learn-tempo").value = bpm;
    document.getElementById("learn-tempo-val").innerText = bpm;
    window.dispatchEvent(new CustomEvent("jubal:tempoChanged", { detail: { bpm, source: "live" } }));
    saveAppSettings();
  });
  document.getElementById("learn-tempo")?.addEventListener("input", e => {
    const bpm = Number(e.target.value);
    Tone.Transport.bpm.value = bpm;
    document.getElementById("learn-tempo-val").innerText = bpm;
    document.getElementById("live-tempo").value = bpm;
    document.getElementById("live-tempo-val").innerText = bpm;
    window.dispatchEvent(new CustomEvent("jubal:tempoChanged", { detail: { bpm, source: "practice" } }));
    saveAppSettings();
  });

  document.getElementById("pads-toggle")?.addEventListener("click", e => {
    currentPadMode = currentPadMode === "arranger" ? "app" : "arranger";
    e.currentTarget.dataset.mode = currentPadMode;
    e.currentTarget.innerText = `PADS · ${currentPadMode === "arranger" ? "ARR" : "APP"}`;
    updateHardwareUI({ currentPadMode, knobModeSynth });
    saveAppSettings();
  });

  document.getElementById("knob-mode-toggle")?.addEventListener("click", e => {
    knobModeSynth = !knobModeSynth;
    e.currentTarget.dataset.mode = knobModeSynth ? "synth" : "app";
    e.currentTarget.innerText = `KNOBS · ${knobModeSynth ? "SYN" : "APP"}`;
    updateHardwareUI({ currentPadMode, knobModeSynth });
    saveAppSettings();
  });

  document.querySelectorAll(".drum-pad").forEach(pad => {
    pad.addEventListener("mousedown", async e => {
      await ensureToneStarted();
      const index = [...e.currentTarget.parentNode.children].indexOf(e.currentTarget);
      const mappings = currentPadMode === "arranger" ? arrangerPadMappings : appPadMappings;
      const action = mappings[index];
      if (action) executeAppControl(action);
      e.currentTarget.classList.add("active");
    });
    pad.addEventListener("mouseup", e => e.currentTarget.classList.remove("active"));
    pad.addEventListener("mouseleave", e => e.currentTarget.classList.remove("active"));
  });

  document.getElementById("metronome-toggle")?.addEventListener("click", async e => {
    await ensureToneStarted();
    metronomeRunning = !metronomeRunning;
    e.target.innerText = `MET · ${metronomeRunning ? "ON" : "OFF"}`;
    if (metronomeRunning && Tone.Transport.state !== "started") Tone.Transport.start();
  });

  // One Tone.Transport repeat is enough; the flag gates it.
  Tone.Transport.scheduleRepeat(time => {
    if (metronomeRunning) {
      voices.grand.volume.value; // Keeps audio module initialization explicit.
      metronomeSynth.triggerAttackRelease("C5", "32n", time);
    }
  }, "4n");
}

function executeAppControl(actionKey, value = null) {
  const isLive = document.getElementById("view-live")?.classList.contains("active");
  const norm = value !== null ? Number(value) / 127 : 1;

  switch (actionKey) {
    case "padModeToggle":
      document.getElementById("pads-toggle")?.click();
      break;
    case "arrSync": toggleArrangerSync(); break;
    case "arrStart":
      document.getElementById("btn-arr-start")?.click();
      break;
    case "arrIntro": selectArrangerSection("intro"); break;
    case "arrMainA": selectArrangerSection("mainA"); break;
    case "arrMainB": selectArrangerSection("mainB"); break;
    case "arrFill": triggerFill(); break;
    case "arrEnding": selectArrangerSection("ending"); break;
    case "masterVolume": mainBus.volume.value = norm * 40 - 30; break;
    case "tempo": {
      const bpm = Math.round(40 + norm * 200);
      Tone.Transport.bpm.value = bpm;
      document.getElementById("live-tempo").value = bpm;
      document.getElementById("live-tempo-val").innerText = bpm;
      document.getElementById("learn-tempo").value = bpm;
      document.getElementById("learn-tempo-val").innerText = bpm;
      window.dispatchEvent(new CustomEvent("jubal:tempoChanged", { detail: { bpm, source: "mapping" } }));
      break;
    }
    case "loopStart":
    case "loopLength": {
      if (isLive) break;
      const state = getTimelineState();
      if (!state.fileMidi || !state.duration) break;
      let start = state.loopStart;
      let end = state.loopEnd;
      if (actionKey === "loopStart") {
        start = norm * state.duration;
        end = Math.min(state.duration, start + state.loopLength);
      } else {
        const length = norm * state.duration;
        end = Math.min(state.duration, start + length);
      }
      setTimelineLoop(start, end);
      break;
    }
    case "playStop":
      if (isLive) {
        if (isRecordingPlaybackActive()) stopRecordingPlayback(); else playRecording();
      } else {
        if (isFilePlaying()) stopFile(); else playFile();
      }
      break;
    case "record":
      toggleRecording();
      break;
    case "transUp": document.getElementById("btn-trans-up")?.click(); break;
    case "transDown": document.getElementById("btn-trans-down")?.click(); break;
    case "octUp": document.getElementById("btn-oct-up")?.click(); break;
    case "octDown": document.getElementById("btn-oct-down")?.click(); break;
    case "accompToggle": document.getElementById("accompaniment-toggle")?.click(); break;
  }
}

function bindMidiMappingUI() {
  document.getElementById("btn-open-midi-map")?.addEventListener("click", openMidiMapModal);
  document.querySelectorAll("[data-action='close-midi-map']").forEach(btn => btn.addEventListener("click", closeMidiMapModal));
  document.querySelectorAll("[data-midi-listen]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [key, type] = btn.dataset.midiListen.split(":");
      startListen(key, type);
    });
  });
  document.querySelectorAll(".midi-map-input").forEach(input => {
    input.addEventListener("change", e => {
      const key = e.target.id.replace("input-", "");
      const type = getMidiMap()[key]?.type || "cc";
      updateMidiMap(key, type, e.target.value);
      saveAppSettings();
    });
  });
  document.querySelectorAll("[data-action='clear-midi-map']").forEach(btn => btn.addEventListener("click", () => {
    clearMidiMap();
    saveAppSettings();
  }));
}

function bindHardwareEvents() {
  window.addEventListener("jubal:midiControl", e => {
    executeAppControl(e.detail.actionKey, e.detail.value);
    saveAppSettings();
  });
  window.addEventListener("jubal:synthCC", e => handleSynthCC(e.detail.cc, e.detail.value));

  window.addEventListener("jubal:midiNoteOn", e => {
    const midi = e.detail.midi;
    window.dispatchEvent(new CustomEvent("jubal:noteOn", {
      detail: {
        midi,
        note: Tone.Frequency(midi, "midi").toNote(),
        velocity: e.detail.velocity,
        containerId: document.getElementById("view-live")?.classList.contains("active") ? "live-keyboard" : "learn-keyboard",
        sourceId: `midi:${e.detail.channel ?? 0}:${midi}`,
        source: "midi"
      }
    }));
  });
  window.addEventListener("jubal:midiNoteOff", e => {
    const midi = e.detail.midi;
    window.dispatchEvent(new CustomEvent("jubal:noteOff", {
      detail: {
        midi,
        note: Tone.Frequency(midi, "midi").toNote(),
        containerId: document.getElementById("view-live")?.classList.contains("active") ? "live-keyboard" : "learn-keyboard",
        sourceId: `midi:${e.detail.channel ?? 0}:${midi}`,
        source: "midi"
      }
    }));
  });
}

function bindContextActions() {
  window.addEventListener("jubal:refreshDiatonic", () => updateDiatonicListDisplay());
  window.addEventListener("contextmenu", e => e.preventDefault());
}

function bindSpacebarPlayback() {
  window.addEventListener("jubal:spacePressed", () => {
    const editor = document.getElementById("editor-modal");
    if (editor?.style.display === "flex") {
      if (isEditorPlaying()) document.getElementById("editor-btn-stop")?.click();
      else document.getElementById("editor-btn-play")?.click();
    } else if (document.getElementById("view-learning")?.classList.contains("active")) {
      if (isFilePlaying()) document.getElementById("btn-file-stop")?.click();
      else if (!document.getElementById("btn-file-play")?.disabled) document.getElementById("btn-file-play")?.click();
    }
  });
}

function initKeyboards() {
  buildKeyboard("live-keyboard", liveBaseOctave, liveKeyCount);
  buildKeyboard("learn-keyboard", learnBaseOctave, 61);
  buildMiniViz();
  updateScaleHighlight();
}

function bindFileState() {
  window.addEventListener("jubal:fileLoaded", () => updateLearnVisuals());
}

function boot() {
  bindUiEvents();
  bindVoiceAndPanelControls();
  bindMidiMappingUI();
  bindHardwareEvents();
  bindContextActions();
  bindSpacebarPlayback();
  bindArrangerUI();
  bindSequencerUI();
  bindMidiEditorUI();
  bindTrackPlayerUI();
  bindAcademyVisualizer();

  const settings = loadSettings();
  applySettings(settings);
  initKeyboards();
  updateHardwareUI({ currentPadMode, knobModeSynth });
  updateDiatonicListDisplay();
  bindFileState();

  // Keep the UI available globally for integrations/legacy consumers.
  window.switchView = switchView;
  window.togglePanel = (key) => import("./ui.js").then(m => m.togglePanel(key));
  window.openMidiMapModal = openMidiMapModal;
  window.closeMidiMapModal = closeMidiMapModal;
  window.startListen = startListen;
  window.clearMidiMap = clearMidiMap;
  window.closeEditor = closeEditor;
  window.saveSettings = saveAppSettings;

  // Prime Web Audio on the first real browser gesture. MIDI messages themselves do
  // not satisfy autoplay policies, so doing this once avoids a delayed first note.
  const unlockAudio = () => ensureToneStarted().catch(() => {});
  window.addEventListener("pointerdown", unlockAudio, { once: true, capture: true });
  window.addEventListener("keydown", unlockAudio, { once: true, capture: true });

  initMIDI();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
