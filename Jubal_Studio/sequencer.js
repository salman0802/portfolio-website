// 6. Sequencer
// Live recording state and @tonejs/midi-only file generation.

import {
  ensureToneStarted, getActiveVoices, editorVoice
} from "./audio-core.js";
import { saveSettings } from "./ui.js";

let isRec = false;
let recStart = 0;
let recNotes = [];
let activeRecs = {};
let recordedPart = null;

export function getRecordedNotes() {
  return recNotes;
}

export function isRecording() {
  return isRec;
}

function updateButtons() {
  const btnRec = document.getElementById("btn-record");
  const btnSave = document.getElementById("btn-save");
  const btnOpenEditor = document.getElementById("btn-open-editor");
  const btnPlayRec = document.getElementById("btn-play-rec");

  if (btnRec) {
    btnRec.classList.toggle("recording", isRec);
    btnRec.innerText = isRec ? "⏹ STOP" : "🔴 REC";
  }
  const hasNotes = recNotes.length > 0;
  if (btnSave) btnSave.disabled = !hasNotes;
  if (btnOpenEditor) btnOpenEditor.disabled = !hasNotes;
  if (btnPlayRec) btnPlayRec.disabled = !hasNotes;
}

function startRecording() {
  isRec = true;
  recStart = Tone.now();
  recNotes = [];
  activeRecs = {};
  updateButtons();
}

function stopRecording() {
  isRec = false;
  updateButtons();
}

export async function toggleRecording() {
  await ensureToneStarted();
  isRec ? stopRecording() : startRecording();
}

window.addEventListener("jubal:resolvedNoteOn", e => {
  if (!isRec) return;
  const { notes, velocity = 0.8 } = e.detail;
  const time = Tone.now() - recStart;
  notes.forEach(name => {
    const midi = midiFromNote(name);
    activeRecs[name] = { midi, name, time, velocity };
  });
});

window.addEventListener("jubal:resolvedNoteOff", e => {
  if (!isRec) return;
  const { notes } = e.detail;
  const now = Tone.now() - recStart;
  notes.forEach(name => {
    const active = activeRecs[name];
    if (!active) return;
    recNotes.push({
      midi: active.midi,
      name,
      time: active.time,
      duration: Math.max(0.01, now - active.time),
      velocity: active.velocity
    });
    delete activeRecs[name];
  });
  updateButtons();
});

function midiFromNote(name) {
  const match = String(name).match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return 60;
  const map = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  return map[match[1]] + (Number(match[2]) + 1) * 12;
}

export async function playRecording() {
  if (!recNotes.length) return;
  await ensureToneStarted();
  if (recordedPart) recordedPart.dispose();

  const { activeLiveVoice } = getActiveVoices();
  const events = recNotes.map(n => ({ time: n.time, notes: [n.name], duration: n.duration }));
  recordedPart = new Tone.Part((time, event) => {
    activeLiveVoice.triggerAttackRelease(event.notes, event.duration, time);
    Tone.Draw.schedule(() => window.dispatchEvent(new CustomEvent("jubal:recordVisualOn", { detail: event })), time);
    Tone.Draw.schedule(() => window.dispatchEvent(new CustomEvent("jubal:recordVisualOff", { detail: event })), time + event.duration);
  }, events).start(0);

  Tone.Transport.position = 0;
  Tone.Transport.start();
  document.getElementById("btn-play-rec")?.setAttribute("disabled", "true");
  const stop = document.getElementById("btn-stop-rec");
  if (stop) stop.disabled = false;
}

export function stopRecordingPlayback() {
  Tone.Transport.pause();
  window.dispatchEvent(new CustomEvent("jubal:clearLiveVisuals"));
  const play = document.getElementById("btn-play-rec");
  const stop = document.getElementById("btn-stop-rec");
  if (play) play.disabled = recNotes.length === 0;
  if (stop) stop.disabled = true;
}

export function saveRecordingAsMidi() {
  if (!recNotes.length || typeof Midi === "undefined") return;
  const m = new Midi();
  const track = m.addTrack();
  recNotes.forEach(n => track.addNote({
    midi: n.midi,
    time: n.time,
    duration: n.duration,
    velocity: n.velocity
  }));
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
  document.getElementById("btn-play-rec")?.addEventListener("click", playRecording);
  document.getElementById("btn-stop-rec")?.addEventListener("click", stopRecordingPlayback);
  document.getElementById("btn-open-editor")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("jubal:openEditor", { detail: { target: "recorded", notes: recNotes } }));
  });
  updateButtons();
}
