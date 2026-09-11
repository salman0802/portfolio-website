// 9. Track Player
// Owns imported MIDI, timeline rendering, loop selection and Tone.Part playback.

import { ensureToneStarted, getActiveVoices } from "./audio-core.js";

let fileMidi = null;
let filePart = null;
let timelineDuration = 0;
let isSelectingTimeline = false;
let tlStartX = 0;
let tlLoopStart = 0;
let tlLoopEnd = 0;
let timelineLoopActive = false;
let currentLoopLength = 0;

const btnFilePlay = () => document.getElementById("btn-file-play");
const btnFileStop = () => document.getElementById("btn-file-stop");
const timelineTrack = () => document.getElementById("timeline-track");
const timelineProgress = () => document.getElementById("timeline-progress");
const timelineLoopRegion = () => document.getElementById("timeline-loop-region");
const timelineCanvas = () => document.getElementById("timeline-canvas");

export function getFileMidi() { return fileMidi; }
export function getTimelineState() {
  return { fileMidi, duration: timelineDuration, loopStart: tlLoopStart, loopEnd: tlLoopEnd, loopActive: timelineLoopActive, loopLength: currentLoopLength };
}

function updateTimelineVisuals() {
  const region = timelineLoopRegion();
  if (!region) return;
  if (timelineLoopActive && timelineDuration > 0) {
    region.style.display = "block";
    region.style.left = `${tlLoopStart / timelineDuration * 100}%`;
    region.style.width = `${(tlLoopEnd - tlLoopStart) / timelineDuration * 100}%`;
  } else {
    region.style.display = "none";
  }
}

function drawTimeline() {
  const track = timelineTrack();
  const canvas = timelineCanvas();
  if (!track || !canvas || !fileMidi || !timelineDuration) return;
  canvas.width = track.clientWidth;
  canvas.height = track.clientHeight;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0, 240, 255, 0.4)";
  fileMidi.tracks.forEach(trackData => {
    trackData.notes.forEach(note => {
      const x = (note.time / timelineDuration) * canvas.width;
      const y = canvas.height - ((note.midi - 36) / 60) * canvas.height;
      ctx.fillRect(x, Math.max(2, y), 2, 6);
    });
  });
}

export async function loadMidiFile(file) {
  if (!file || typeof Midi === "undefined") return;
  fileMidi = new Midi(await file.arrayBuffer());
  timelineDuration = fileMidi.duration;
  tlLoopStart = 0;
  tlLoopEnd = timelineDuration;
  timelineLoopActive = false;
  currentLoopLength = 0;

  if (btnFilePlay()) btnFilePlay().disabled = false;
  const editor = document.getElementById("btn-open-file-editor");
  if (editor) editor.disabled = false;
  drawTimeline();
  updateTimelineVisuals();
  window.dispatchEvent(new CustomEvent("jubal:fileLoaded", { detail: { midi: fileMidi, duration: timelineDuration } }));
}

export async function playFile() {
  if (!fileMidi) return;
  await ensureToneStarted();
  if (filePart) filePart.dispose();

  const { activeLearnVoice } = getActiveVoices();
  const events = [];
  fileMidi.tracks.forEach(track => track.notes.forEach(note => {
    events.push({ time: note.time, notes: [note.name], duration: note.duration });
  }));

  filePart = new Tone.Part((time, event) => {
    activeLearnVoice.triggerAttackRelease(event.notes, event.duration, time);
    Tone.Draw.schedule(() => window.dispatchEvent(new CustomEvent("jubal:learnVisualOn", { detail: event })), time);
    Tone.Draw.schedule(() => window.dispatchEvent(new CustomEvent("jubal:learnVisualOff", { detail: event })), time + event.duration);
  }, events).start(0);

  if (!timelineLoopActive) Tone.Transport.seconds = 0;
  Tone.Transport.start();
  if (btnFilePlay()) btnFilePlay().disabled = true;
  if (btnFileStop()) btnFileStop().disabled = false;
}

export function stopFile() {
  Tone.Transport.pause();
  Tone.Transport.loop = false;
  timelineLoopActive = false;
  updateTimelineVisuals();
  window.dispatchEvent(new CustomEvent("jubal:clearLearnVisuals"));
  if (btnFilePlay()) btnFilePlay().disabled = !fileMidi;
  if (btnFileStop()) btnFileStop().disabled = true;
}

export function setTimelineLoop(start, end) {
  if (!timelineDuration) return;
  tlLoopStart = Math.max(0, Math.min(start, timelineDuration));
  tlLoopEnd = Math.max(tlLoopStart + 0.01, Math.min(end, timelineDuration));
  currentLoopLength = tlLoopEnd - tlLoopStart;
  timelineLoopActive = currentLoopLength > 0.01;
  if (timelineLoopActive) {
    Tone.Transport.setLoopPoints(tlLoopStart, tlLoopEnd);
    Tone.Transport.loop = true;
  } else {
    Tone.Transport.loop = false;
  }
  updateTimelineVisuals();
}

export function bindTrackPlayerUI() {
  document.getElementById("file-input")?.addEventListener("change", e => loadMidiFile(e.target.files?.[0]));
  document.getElementById("btn-file-play")?.addEventListener("click", playFile);
  document.getElementById("btn-file-stop")?.addEventListener("click", stopFile);

  const track = timelineTrack();
  if (!track) return;

  track.addEventListener("mousedown", e => {
    if (!timelineDuration) return;
    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    isSelectingTimeline = true;
    tlStartX = clickX;
    timelineLoopActive = false;
    updateTimelineVisuals();
    Tone.Transport.loop = false;
    Tone.Transport.seconds = (clickX / track.clientWidth) * timelineDuration;
  });

  window.addEventListener("mousemove", e => {
    if (!isSelectingTimeline || !timelineDuration) return;
    const rect = track.getBoundingClientRect();
    const curX = Math.max(0, Math.min(e.clientX - rect.left, track.clientWidth));
    if (Math.abs(curX - tlStartX) <= 5) return;
    const minPx = Math.min(tlStartX, curX);
    const maxPx = Math.max(tlStartX, curX);
    setTimelineLoop(
      (minPx / track.clientWidth) * timelineDuration,
      (maxPx / track.clientWidth) * timelineDuration
    );
  });

  window.addEventListener("mouseup", () => {
    if (!isSelectingTimeline) return;
    if (timelineLoopActive) {
      Tone.Transport.setLoopPoints(tlLoopStart, tlLoopEnd);
      Tone.Transport.loop = true;
      Tone.Transport.seconds = tlLoopStart;
    }
    isSelectingTimeline = false;
  });

  setInterval(() => {
    if (Tone.Transport.state === "started" && timelineDuration > 0 && document.getElementById("view-learning")?.classList.contains("active")) {
      const currentSec = Tone.Transport.seconds;
      const progress = timelineProgress();
      if (progress) progress.style.width = `${Math.min(100, currentSec / timelineDuration * 100)}%`;
      if (!Tone.Transport.loop && currentSec >= timelineDuration) stopFile();
    }
  }, 50);

  window.addEventListener("resize", drawTimeline);
}
