// 10. Academy Visualizer
// Waterfall, acoustic pitch detection and the wind-instrument SVG overlay.
// The microphone uses its own Web Audio context and never connects into Tone.js.

import { modifyActiveLearnNote, updateLearnVisuals } from "./main-visuals.js";

const recorderFingering = {
  C: [0, 1, 2, 3, 4, 5, "6a", "6b", "7a", "7b"],
  D: [0, 1, 2, 3, 4, 5, "6a", "6b"],
  E: [0, 1, 2, 3, 4, 5],
  F: [0, 1, 2, 3, 4, "6a", "6b", "7a", "7b"],
  G: [0, 1, 2, 3],
  A: [0, 1, 2],
  B: [0, 1],
  "C#": [0, 1, 2, 4, 5],
  "F#": [0, 1, 2, 3, 5, "6a", "6b"]
};
const bansuriFingering = {
  C: [1, 2, 3, 4, 5, 6],
  D: [1, 2, 3, 4, 5],
  E: [1, 2, 3, 4],
  F: [1, 2, 3],
  G: [1, 2],
  A: [1],
  B: [],
  "C#": [1, 2, 3, 4, 6],
  "F#": [1, 2, 4, 5]
};

let audioContext = null;
let analyser = null;
let microphone = null;
let micProcessor = null;
let mediaStream = null;
let isMicActive = false;
let lastDetectedNote = null;

const wfCanvas = () => document.getElementById("waterfall-canvas");
const wfCtx = () => wfCanvas()?.getContext("2d");

export function resizeWaterfall() {
  const canvas = wfCanvas();
  const wrapper = document.getElementById("waterfall-wrapper");
  if (canvas && wrapper) {
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
  }
}

function getNormalizedKeyRect(midiPitch) {
  const learnBaseOctave = Number(window.jubalLearnBaseOctave || 2);
  const startMidi = learnBaseOctave * 12 + 12;
  const offset = midiPitch - startMidi;
  if (offset < 0 || offset >= 60) return null;

  const oct = Math.floor(offset / 12);
  const note = offset % 12;
  const whiteIndex = [0, -1, 1, -1, 2, 3, -1, 4, -1, 5, -1, 6][note];
  if (whiteIndex !== -1) {
    return { x: (oct * 7 + whiteIndex) / 35, w: 1 / 35, isBlack: false };
  }
  const prevWhite = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][note];
  const nextIndex = oct * 7 + prevWhite + 1;
  const w = 0.6 / 35;
  return { x: nextIndex / 35 - w / 2, w, isBlack: true };
}

export function drawWaterfall() {
  const canvas = wfCanvas();
  const ctx = wfCtx();
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (document.getElementById("view-learning")?.classList.contains("active") &&
      document.getElementById("learn-instrument")?.value === "piano") {
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i <= 35; i++) {
      const x = i * (canvas.width / 35);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }

    const midi = window.jubalGetFileMidi?.();
    if (midi && Tone.Transport.state === "started") {
      const now = Tone.Transport.seconds;
      const pxPerSec = 130;
      const whiteNotes = [];
      const blackNotes = [];

      midi.tracks.forEach(track => track.notes.forEach(note => {
        if (note.time < now + 2.5 && note.time + note.duration > now - 1) {
          const rect = getNormalizedKeyRect(note.midi);
          if (rect) (rect.isBlack ? blackNotes : whiteNotes).push({ note, rect });
        }
      }));

      const drawNote = (item, stroke) => {
        const yBottom = canvas.height - ((item.note.time - now) * pxPerSec);
        const h = item.note.duration * pxPerSec;
        const x = item.rect.x * canvas.width;
        const w = item.rect.w * canvas.width;
        ctx.fillStyle = stroke;
        ctx.fillRect(x + 1, yBottom - h, Math.max(1, w - 2), h);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillRect(x + 1, yBottom - 4, Math.max(1, w - 2), 4);
      };
      whiteNotes.forEach(n => drawNote(n, "rgba(168, 85, 247, 0.8)"));
      blackNotes.forEach(n => drawNote(n, "rgba(0, 240, 255, 0.95)"));
    }
  }

  requestAnimationFrame(drawWaterfall);
}

function updateMicDisplay(noteName, cents) {
  const display = document.getElementById("mic-note-display");
  const fill = document.getElementById("intonation-fill");
  if (!display || !fill) return;
  display.innerText = noteName || "--";
  if (noteName === null) {
    fill.style.width = "0%";
    return;
  }
  fill.style.width = `${Math.min(50, Math.abs(cents))}%`;
  fill.style.left = cents < 0 ? `${50 - Math.min(50, Math.abs(cents))}%` : "50%";
  fill.style.background = Math.abs(cents) < 10 ? "var(--success)" : "var(--accent-gold)";
}

export function detectPitch() {
  if (!isMicActive || !analyser || !audioContext) return;
  const buffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);
  let rms = 0;
  for (const sample of buffer) rms += sample * sample;
  rms = Math.sqrt(rms / buffer.length);

  if (rms < 0.01) {
    updateMicDisplay(null, 0);
    if (lastDetectedNote) {
      modifyActiveLearnNote(lastDetectedNote, false);
      updateLearnVisuals();
      lastDetectedNote = null;
    }
  } else {
    const c = new Array(buffer.length).fill(0);
    for (let i = 0; i < buffer.length; i++) {
      for (let j = 0; j < buffer.length - i; j++) c[i] += buffer[j] * buffer[j + i];
    }
    let d = 0;
    while (d < c.length - 1 && c[d] > c[d + 1]) d++;
    let maxVal = -1, maxPos = -1;
    for (let i = d; i < c.length; i++) {
      if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
    }
    if (maxPos > 0) {
      const pitch = audioContext.sampleRate / maxPos;
      const midi = Math.round(12 * (Math.log(pitch / 440) / Math.log(2))) + 69;
      const cents = Math.floor(1200 * Math.log(pitch / (440 * Math.pow(2, (midi - 69) / 12))) / Math.log(2));
      const noteName = Tone.Frequency(midi, "midi").toNote();
      updateMicDisplay(noteName, cents);
      if (lastDetectedNote !== noteName) {
        if (lastDetectedNote) modifyActiveLearnNote(lastDetectedNote, false);
        lastDetectedNote = noteName;
        modifyActiveLearnNote(noteName, true);
        updateLearnVisuals();
      }
    }
  }
  micProcessor = requestAnimationFrame(detectPitch);
}

export async function toggleMic() {
  if (isMicActive) {
    if (micProcessor) cancelAnimationFrame(micProcessor);
    mediaStream?.getTracks().forEach(track => track.stop());
    microphone?.disconnect();
    if (audioContext) await audioContext.close();
    audioContext = null;
    analyser = null;
    microphone = null;
    mediaStream = null;
    isMicActive = false;
    document.getElementById("btn-toggle-mic")?.replaceChildren(document.createTextNode("🎤 Enable Microphone"));
    document.getElementById("mic-status-badge")?.style.setProperty("display", "none");
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    microphone = audioContext.createMediaStreamSource(mediaStream);
    microphone.connect(analyser);
    isMicActive = true;
    document.getElementById("btn-toggle-mic")?.replaceChildren(document.createTextNode("⏹ Disable Microphone"));
    document.getElementById("mic-status-badge")?.style.setProperty("display", "flex");
    detectPitch();
  } catch (error) {
    console.error(error);
    alert("Microphone access denied or requires HTTPS.");
  }
}

function updateWindOverlay(instrument, noteName) {
  document.querySelectorAll(".hole-overlay").forEach(el => el.classList.remove("active-hole", "covered"));
  const prefix = instrument === "bansuri" ? "ban" : "rec";
  const chart = instrument === "bansuri" ? bansuriFingering : recorderFingering;
  document.querySelectorAll(`.${instrument === "bansuri" ? "ban-hole" : "rec-hole"}`).forEach(el => el.classList.add("active-hole"));
  const holes = chart[noteName?.replace(/[0-9]/g, "")];
  if (holes) holes.forEach(h => document.getElementById(`${prefix}-${h}`)?.classList.add("covered"));
}

export function bindAcademyVisualizer() {
  window.jubalGetFileMidi = window.jubalGetFileMidi || (() => null);
  document.getElementById("btn-toggle-mic")?.addEventListener("click", toggleMic);
  document.getElementById("learn-instrument")?.addEventListener("change", e => {
    const val = e.target.value;
    document.querySelectorAll(".hole-overlay").forEach(el => el.classList.remove("active-hole", "covered"));
    const isWind = val === "bansuri" || val === "recorder";
    document.getElementById("learn-piano-wrapper")?.style.setProperty("display", isWind ? "none" : "flex");
    document.getElementById("learn-wind-container")?.style.setProperty("display", isWind ? "flex" : "none");
    document.getElementById("svg-recorder")?.style.setProperty("display", val === "recorder" ? "block" : "none");
    document.getElementById("svg-bansuri")?.style.setProperty("display", val === "bansuri" ? "block" : "none");
    document.getElementById("mic-training-panel")?.style.setProperty("display", isWind ? "flex" : "none");
    if (isWind) updateWindOverlay(val, null);
    else if (isMicActive) toggleMic();
    resizeWaterfall();
  });
  window.addEventListener("resize", resizeWaterfall);
  window.addEventListener("jubal:resizeWaterfall", resizeWaterfall);
  window.addEventListener("jubal:learnVisualOn", e => {
    updateWindOverlay(document.getElementById("learn-instrument")?.value, e.detail.name || e.detail.notes?.[0]);
  });
  window.addEventListener("jubal:learnVisualOff", () => {});
  resizeWaterfall();
  drawWaterfall();
}
