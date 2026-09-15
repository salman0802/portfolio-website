// Track Player: imported MIDI, timeline/loop UI and reliable audio-clock playback.

import { getActiveVoices } from "./audio-core.js";
import { createPlaybackEngine } from "./playback-engine.js";

let fileMidi = null;
let timelineDuration = 0;
let isSelectingTimeline = false;
let tlStartX = 0;
let tlLoopStart = 0;
let tlLoopEnd = 0;
let timelineLoopActive = false;
let currentLoopLength = 0;
let playbackEvents = [];
let sourceTempo = 120;
let targetTempo = 120;

const btnFilePlay = () => document.getElementById("btn-file-play");
const btnFileStop = () => document.getElementById("btn-file-stop");
const timelineTrack = () => document.getElementById("timeline-track");
const timelineProgress = () => document.getElementById("timeline-progress");
const timelineLoopRegion = () => document.getElementById("timeline-loop-region");
const timelineCanvas = () => document.getElementById("timeline-canvas");

const filePlayer = createPlaybackEngine({
  scheduleAudio(event, when) {
    const { activeLearnVoice } = getActiveVoices();
    activeLearnVoice.triggerAttackRelease(event.notes, event.duration, when, event.velocity);
  },
  releaseAudio() {
    getActiveVoices().activeLearnVoice.releaseAll();
  },
  onEventStart(event) {
    window.dispatchEvent(new CustomEvent("jubal:learnVisualOn", { detail: event }));
  },
  onEventEnd(event) {
    window.dispatchEvent(new CustomEvent("jubal:learnVisualOff", { detail: event }));
  },
  onPosition(position) {
    const progress = timelineProgress();
    if (progress && timelineDuration > 0) progress.style.width = `${Math.min(100, Math.max(0, position / timelineDuration * 100))}%`;
  },
  onStateChange({ playing }) {
    if (btnFilePlay()) btnFilePlay().disabled = playing || !fileMidi;
    if (btnFileStop()) btnFileStop().disabled = !playing;
  },
  onEnded(info) {
    if (!info?.stopped) window.dispatchEvent(new CustomEvent("jubal:clearLearnVisuals"));
  }
});


function detectMidiTempo(midi) {
  const tempo = Number(midi?.header?.tempos?.[0]?.bpm);
  return Number.isFinite(tempo) && tempo > 0 ? tempo : 120;
}

function updatePracticeTempoUi(bpm) {
  const safe = Math.round(Math.max(40, Math.min(240, Number(bpm) || 120)));
  const slider = document.getElementById("learn-tempo");
  const value = document.getElementById("learn-tempo-val");
  if (slider) slider.value = String(safe);
  if (value) value.innerText = String(safe);
}

export function setPracticeTempo(bpm, { updateUi = false } = {}) {
  targetTempo = Math.max(40, Math.min(240, Number(bpm) || sourceTempo || 120));
  const rate = targetTempo / Math.max(1, sourceTempo || 120);
  filePlayer.setPlaybackRate(rate);
  if (updateUi) updatePracticeTempoUi(targetTempo);
  return { sourceTempo, targetTempo, rate };
}

export function getPracticeTempoState() {
  return { sourceTempo, targetTempo, rate: filePlayer.getPlaybackRate() };
}

export function getFileMidi() { return fileMidi; }
export function isFilePlaying() { return filePlayer.isPlaying(); }

function buildPlaybackEvents() {
  if (!fileMidi) return [];
  const events = [];
  fileMidi.tracks.forEach(track => track.notes.forEach(note => {
    const midi = Number(note.midi);
    if (!Number.isFinite(midi)) return;
    const name = note.name || Tone.Frequency(midi, "midi").toNote();
    events.push({
      time: Math.max(0, Number(note.time) || 0),
      notes: [name],
      name,
      midi,
      duration: Math.max(0.01, Number(note.duration) || 0.1),
      velocity: Math.max(0.01, Math.min(1, Number(note.velocity) || 0.8))
    });
  }));
  return events.sort((a, b) => a.time - b.time || a.midi - b.midi);
}

function refreshPlayerEvents() {
  playbackEvents = buildPlaybackEvents();
  const inferred = playbackEvents.reduce((max, event) => Math.max(max, event.time + event.duration), 0);
  timelineDuration = Math.max(0.01, Number(fileMidi?.duration) || inferred || 0.01);
  filePlayer.setEvents(playbackEvents, timelineDuration);
  filePlayer.setLoop(timelineLoopActive, tlLoopStart, tlLoopEnd || timelineDuration);
}

export function applyEditedFileNotes(notes) {
  if (!fileMidi) return false;
  let track = fileMidi.tracks.find(t => t.notes.length > 0);
  if (!track) track = fileMidi.tracks[0] || fileMidi.addTrack();
  fileMidi.tracks.forEach(t => t.notes.splice(0, t.notes.length));
  (notes || []).forEach(note => track.addNote({
    midi: Math.max(0, Math.min(127, Number(note.midi) || 0)),
    time: Math.max(0, Number(note.time) || 0),
    duration: Math.max(0.01, Number(note.duration) || 0.1),
    velocity: Math.max(0, Math.min(1, Number(note.velocity) || 0.8))
  }));
  refreshPlayerEvents();
  tlLoopStart = Math.min(tlLoopStart, timelineDuration);
  tlLoopEnd = Math.min(Math.max(tlLoopStart + 0.01, tlLoopEnd || timelineDuration), timelineDuration);
  currentLoopLength = Math.max(0, tlLoopEnd - tlLoopStart);
  drawTimeline();
  updateTimelineVisuals();
  window.dispatchEvent(new CustomEvent("jubal:fileEdited", { detail: { midi: fileMidi, duration: timelineDuration } }));
  return true;
}

export function getTimelineState() {
  return {
    fileMidi,
    duration: timelineDuration,
    loopStart: tlLoopStart,
    loopEnd: tlLoopEnd,
    loopActive: timelineLoopActive,
    loopLength: currentLoopLength,
    playing: filePlayer.isPlaying(),
    position: filePlayer.getPosition()
  };
}

function updateTimelineVisuals() {
  const region = timelineLoopRegion();
  if (!region) return;
  if (timelineLoopActive && timelineDuration > 0) {
    region.style.display = "block";
    region.style.left = `${tlLoopStart / timelineDuration * 100}%`;
    region.style.width = `${(tlLoopEnd - tlLoopStart) / timelineDuration * 100}%`;
  } else region.style.display = "none";
}

function drawTimeline() {
  const track = timelineTrack();
  const canvas = timelineCanvas();
  if (!track || !canvas || !fileMidi || !timelineDuration) return;
  canvas.width = track.clientWidth;
  canvas.height = track.clientHeight;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(91, 141, 239, 0.52)";
  fileMidi.tracks.forEach(trackData => {
    trackData.notes.forEach(note => {
      const x = (note.time / timelineDuration) * canvas.width;
      const y = canvas.height - ((note.midi - 36) / 60) * canvas.height;
      ctx.fillRect(x, Math.max(2, y), 2, 6);
    });
  });
}

export async function loadMidiFile(file) {
  if (!file || typeof Midi === "undefined") return false;
  stopFile();
  try {
    fileMidi = new Midi(await file.arrayBuffer());
    sourceTempo = detectMidiTempo(fileMidi);
    targetTempo = sourceTempo;
    filePlayer.setPlaybackRate(1);
    updatePracticeTempoUi(sourceTempo);
    timelineDuration = Math.max(0.01, Number(fileMidi.duration) || 0.01);
    tlLoopStart = 0;
    tlLoopEnd = timelineDuration;
    timelineLoopActive = false;
    currentLoopLength = 0;
    refreshPlayerEvents();
    if (btnFilePlay()) btnFilePlay().disabled = playbackEvents.length === 0;
    const editor = document.getElementById("btn-open-file-editor");
    if (editor) editor.disabled = playbackEvents.length === 0;
    drawTimeline();
    updateTimelineVisuals();
    const progress = timelineProgress();
    if (progress) progress.style.width = "0%";
    window.dispatchEvent(new CustomEvent("jubal:fileLoaded", { detail: { midi: fileMidi, duration: timelineDuration, noteCount: playbackEvents.length } }));
    return playbackEvents.length > 0;
  } catch (error) {
    console.error("Failed to load MIDI file", error);
    fileMidi = null;
    playbackEvents = [];
    if (btnFilePlay()) btnFilePlay().disabled = true;
    return false;
  }
}

export async function playFile() {
  if (!fileMidi || !playbackEvents.length) return false;
  const start = timelineLoopActive ? tlLoopStart : filePlayer.getPosition() >= timelineDuration - 0.01 ? 0 : filePlayer.getPosition();
  filePlayer.setLoop(timelineLoopActive, tlLoopStart, tlLoopEnd);
  const played = await filePlayer.play(start);
  if (!played) return false;
  return true;
}

export function stopFile({ reset = true } = {}) {
  filePlayer.stop({ reset });
  window.dispatchEvent(new CustomEvent("jubal:clearLearnVisuals"));
  if (reset) {
    const progress = timelineProgress();
    if (progress) progress.style.width = "0%";
  }
  if (btnFilePlay()) btnFilePlay().disabled = !fileMidi || !playbackEvents.length;
  if (btnFileStop()) btnFileStop().disabled = true;
}

export function setTimelineLoop(start, end) {
  if (!timelineDuration) return;
  tlLoopStart = Math.max(0, Math.min(Number(start) || 0, timelineDuration));
  tlLoopEnd = Math.max(tlLoopStart + 0.01, Math.min(Number(end) || timelineDuration, timelineDuration));
  currentLoopLength = tlLoopEnd - tlLoopStart;
  timelineLoopActive = currentLoopLength > 0.01;
  filePlayer.setLoop(timelineLoopActive, tlLoopStart, tlLoopEnd);
  updateTimelineVisuals();
}

export function bindTrackPlayerUI() {
  document.getElementById("file-input")?.addEventListener("change", e => loadMidiFile(e.target.files?.[0]));
  window.addEventListener("jubal:tempoChanged", e => {
    const bpm = Number(e.detail?.bpm);
    if (Number.isFinite(bpm)) setPracticeTempo(bpm);
  });
  document.getElementById("btn-file-play")?.addEventListener("click", () => playFile());
  document.getElementById("btn-file-stop")?.addEventListener("click", () => stopFile());

  const track = timelineTrack();
  if (!track) return;

  track.addEventListener("mousedown", e => {
    if (!timelineDuration) return;
    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    isSelectingTimeline = true;
    tlStartX = clickX;
    timelineLoopActive = false;
    filePlayer.setLoop(false);
    updateTimelineVisuals();
    filePlayer.seek((clickX / track.clientWidth) * timelineDuration);
  });

  window.addEventListener("mousemove", e => {
    if (!isSelectingTimeline || !timelineDuration) return;
    const rect = track.getBoundingClientRect();
    const curX = Math.max(0, Math.min(e.clientX - rect.left, track.clientWidth));
    if (Math.abs(curX - tlStartX) <= 5) return;
    const minPx = Math.min(tlStartX, curX);
    const maxPx = Math.max(tlStartX, curX);
    setTimelineLoop((minPx / track.clientWidth) * timelineDuration, (maxPx / track.clientWidth) * timelineDuration);
  });

  window.addEventListener("mouseup", () => {
    if (!isSelectingTimeline) return;
    if (timelineLoopActive) filePlayer.seek(tlLoopStart);
    isSelectingTimeline = false;
  });

  window.addEventListener("resize", drawTimeline);
}
