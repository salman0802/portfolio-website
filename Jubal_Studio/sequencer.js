// Live recorder and imported MIDI playback for the Performance workspace.

import { ensureToneStarted, getActiveVoices } from "./audio-core.js";
import { createPlaybackEngine } from "./playback-engine.js";

let isRec = false;
let recStart = 0;
let recNotes = [];
let activeRecs = {};
let recorderSourceName = "";

const recordedPlayer = createPlaybackEngine({
  scheduleAudio(event, when) {
    getActiveVoices().activeLiveVoice.triggerAttackRelease(event.notes, event.duration, when, event.velocity);
  },
  releaseAudio() {
    getActiveVoices().activeLiveVoice.releaseAll();
  },
  onEventStart(event) {
    window.dispatchEvent(new CustomEvent("jubal:recordVisualOn", { detail: event }));
  },
  onEventEnd(event) {
    window.dispatchEvent(new CustomEvent("jubal:recordVisualOff", { detail: event }));
  },
  onStateChange({ playing }) {
    const play = document.getElementById("btn-play-rec");
    const stop = document.getElementById("btn-stop-rec");
    if (play) play.disabled = playing || recNotes.length === 0;
    if (stop) stop.disabled = !playing;
  },
  onEnded() {
    window.dispatchEvent(new CustomEvent("jubal:clearLiveVisuals"));
  }
});

export function getRecordedNotes() { return recNotes; }
export function isRecording() { return isRec; }
export function isRecordingPlaybackActive() { return recordedPlayer.isPlaying(); }

function normalizeRecordedNotes(notes = []) {
  return notes.map(note => {
    const midi = Math.max(0, Math.min(127, Math.round(Number(note.midi) || 0)));
    return {
      midi,
      name: note.name || Tone.Frequency(midi, "midi").toNote(),
      time: Math.max(0, Number(note.time) || 0),
      duration: Math.max(0.01, Number(note.duration) || 0.1),
      velocity: Math.max(0.01, Math.min(1, Number(note.velocity) || 0.8))
    };
  }).sort((a, b) => a.time - b.time || a.midi - b.midi);
}

function syncRecordedPlayer() {
  const events = recNotes.map(note => ({ ...note, notes: [note.name] }));
  const duration = events.reduce((max, event) => Math.max(max, event.time + event.duration), 0);
  recordedPlayer.setEvents(events, duration);
}

export function applyEditedRecordedNotes(notes) {
  recNotes.splice(0, recNotes.length, ...normalizeRecordedNotes(notes));
  if (!recorderSourceName && recNotes.length) recorderSourceName = "Edited take";
  syncRecordedPlayer();
  updateButtons();
  return recNotes;
}

function updateButtons() {
  const btnRec = document.getElementById("btn-record");
  const btnSave = document.getElementById("btn-save");
  const btnOpenEditor = document.getElementById("btn-open-editor");
  const btnPlayRec = document.getElementById("btn-play-rec");
  const btnStopRec = document.getElementById("btn-stop-rec");
  if (btnRec) {
    btnRec.classList.toggle("recording", isRec);
    btnRec.innerText = isRec ? "■" : "●";
    btnRec.setAttribute("aria-label", isRec ? "Stop recording" : "Record");
    btnRec.title = isRec ? "Stop recording" : "Record";
  }
  const hasNotes = recNotes.length > 0;
  if (btnSave) btnSave.disabled = !hasNotes;
  if (btnOpenEditor) btnOpenEditor.disabled = !hasNotes;
  if (btnPlayRec) btnPlayRec.disabled = !hasNotes || recordedPlayer.isPlaying();
  if (btnStopRec) btnStopRec.disabled = !recordedPlayer.isPlaying();
  const status = document.getElementById("recorder-file-status");
  if (status) {
    status.textContent = hasNotes ? `${recorderSourceName || "Take"} · ${recNotes.length} notes` : "No file loaded";
    status.classList.toggle("loaded", hasNotes);
  }
}

function startRecording() {
  recordedPlayer.stop();
  isRec = true;
  recStart = Tone.immediate();
  recNotes = [];
  activeRecs = {};
  recorderSourceName = "Live take";
  updateButtons();
}
function stopRecording() { isRec = false; syncRecordedPlayer(); updateButtons(); }

export async function toggleRecording() {
  await ensureToneStarted();
  isRec ? stopRecording() : startRecording();
}

window.addEventListener("jubal:resolvedNoteOn", e => {
  if (!isRec) return;
  const { notes, velocity = 0.8 } = e.detail;
  const time = Tone.immediate() - recStart;
  notes.forEach(name => { activeRecs[name] = { midi: midiFromNote(name), name, time, velocity }; });
});

window.addEventListener("jubal:resolvedNoteOff", e => {
  if (!isRec) return;
  const now = Tone.immediate() - recStart;
  e.detail.notes.forEach(name => {
    const active = activeRecs[name];
    if (!active) return;
    recNotes.push({ midi: active.midi, name, time: active.time, duration: Math.max(0.01, now - active.time), velocity: active.velocity });
    delete activeRecs[name];
  });
  recNotes.sort((a, b) => a.time - b.time);
  updateButtons();
});

function midiFromNote(name) {
  const match = String(name).match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return 60;
  const map = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  return map[match[1]] + (Number(match[2]) + 1) * 12;
}

export async function importMidiToRecorder(file) {
  if (!file || typeof Midi === "undefined") return false;
  try {
    if (isRec) stopRecording();
    stopRecordingPlayback();
    const midi = new Midi(await file.arrayBuffer());
    const imported = normalizeRecordedNotes(midi.tracks.flatMap(track => track.notes));
    recNotes.splice(0, recNotes.length, ...imported);
    activeRecs = {};
    recorderSourceName = file.name || "Imported MIDI";
    syncRecordedPlayer();
    updateButtons();
    window.dispatchEvent(new CustomEvent("jubal:recorderImported", { detail: { notes: recNotes, fileName: recorderSourceName } }));
    return imported.length > 0;
  } catch (error) {
    console.error("Failed to import recorder MIDI", error);
    const status = document.getElementById("recorder-file-status");
    if (status) { status.textContent = "Import failed"; status.classList.remove("loaded"); }
    return false;
  }
}

export async function playRecording() {
  if (!recNotes.length) return false;
  syncRecordedPlayer();
  const played = await recordedPlayer.play(0);
  updateButtons();
  return played;
}

export function stopRecordingPlayback() {
  recordedPlayer.stop();
  window.dispatchEvent(new CustomEvent("jubal:clearLiveVisuals"));
  updateButtons();
}

export function saveRecordingAsMidi() {
  if (!recNotes.length || typeof Midi === "undefined") return;
  const m = new Midi();
  const track = m.addTrack();
  recNotes.forEach(n => track.addNote({ midi: n.midi, time: n.time, duration: n.duration, velocity: n.velocity }));
  const blob = new Blob([m.toArray()], { type: "audio/midi" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "jubal_recording.mid";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function bindSequencerUI() {
  document.getElementById("btn-record")?.addEventListener("click", toggleRecording);
  document.getElementById("btn-save")?.addEventListener("click", saveRecordingAsMidi);
  document.getElementById("btn-play-rec")?.addEventListener("click", () => playRecording());
  document.getElementById("btn-stop-rec")?.addEventListener("click", stopRecordingPlayback);
  document.getElementById("live-file-input")?.addEventListener("change", e => importMidiToRecorder(e.target.files?.[0]));
  document.getElementById("btn-open-editor")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("jubal:openEditor", { detail: { target: "recorded", notes: recNotes } }));
  });
  syncRecordedPlayer();
  updateButtons();
}
