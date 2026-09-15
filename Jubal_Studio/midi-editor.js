// 8. MIDI Editor
// Professional piano-roll editor with shared pointer handling, grid snapping,
// multi-note editing, marquee selection, undo/redo and explicit source commits.

import { editorVoice, ensureToneStarted } from "./audio-core.js";
import { getFileMidi, applyEditedFileNotes, stopFile } from "./track-player.js";
import { getRecordedNotes, applyEditedRecordedNotes, stopRecordingPlayback } from "./sequencer.js";
import { createPlaybackEngine } from "./playback-engine.js";

let currentEditingTarget = null;
let sourceNotesRef = null;
let currentNotes = [];
let editorMaxDuration = 1;
let currentLowPitch = 21;
let currentHighPitch = 108;
let currentRowHeight = 18;
let editorScaleX = 130;
let editorLoopActive = false;
let loopStartSec = 0;
let loopEndSec = 0;
let clipboardNotes = [];
let selectedIndexes = new Set();
let interaction = null;
let editorBound = false;
let playheadFrame = null;

const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 100;

const modal = () => document.getElementById("editor-modal");
const viewport = () => document.getElementById("roll-viewport");
const content = () => document.getElementById("roll-canvas-content");
const bg = () => document.getElementById("roll-canvas-bg");
const sidebar = () => document.getElementById("editor-keys-sidebar");
const playhead = () => document.getElementById("editor-playhead");
const ruler = () => document.getElementById("editor-timeline-ruler");
const rulerCanvas = () => document.getElementById("ruler-canvas");
const loopOverlay = () => document.getElementById("editor-loop-overlay");
const info = () => document.getElementById("editor-selection-info");

const editorPlayer = createPlaybackEngine({
  scheduleAudio(event, when) {
    editorVoice.triggerAttackRelease(event.note, event.duration, when, event.velocity);
  },
  releaseAudio() { editorVoice.releaseAll(); },
  onStateChange({ playing }) {
    const play = document.getElementById("editor-btn-play");
    const stop = document.getElementById("editor-btn-stop");
    if (play) play.disabled = playing || currentNotes.length === 0;
    if (stop) stop.disabled = !playing;
  }
});

export function isEditorPlaying() { return editorPlayer.isPlaying(); }

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cloneNotes(notes) {
  return (notes || []).map(note => {
    const midi = clamp(Math.round(Number(note.midi) || 0), 0, 127);
    return {
      midi,
      name: Tone.Frequency(midi, "midi").toNote(),
      time: Math.max(0, Number(note.time) || 0),
      duration: Math.max(0.02, Number(note.duration) || 0.1),
      velocity: clamp(Number(note.velocity) || 0.8, 0.01, 1)
    };
  });
}

function snapshot() {
  return cloneNotes(currentNotes);
}

function pushUndoSnapshot(notes = snapshot()) {
  undoStack.push(cloneNotes(notes));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function replaceNotes(nextNotes, { preserveView = true } = {}) {
  currentNotes = cloneNotes(nextNotes);
  selectedIndexes = new Set([...selectedIndexes].filter(i => i < currentNotes.length));
  renderPianoRoll({ preserveView });
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  currentNotes = cloneNotes(undoStack.pop());
  selectedIndexes.clear();
  renderPianoRoll({ preserveView: true });
  updateHistoryButtons();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  currentNotes = cloneNotes(redoStack.pop());
  selectedIndexes.clear();
  renderPianoRoll({ preserveView: true });
  updateHistoryButtons();
}

function updateHistoryButtons() {
  const undoButton = document.getElementById("editor-action-undo");
  const redoButton = document.getElementById("editor-action-redo");
  if (undoButton) undoButton.disabled = undoStack.length === 0;
  if (redoButton) redoButton.disabled = redoStack.length === 0;
}

function updateSelectionInfo() {
  const el = info();
  if (!el) return;
  const selected = [...selectedIndexes].map(i => currentNotes[i]).filter(Boolean);
  if (!selected.length) {
    el.textContent = `${currentNotes.length} notes`;
    return;
  }
  const first = selected[0];
  el.textContent = selected.length === 1
    ? `${first.name} · ${first.time.toFixed(3)}s · ${first.duration.toFixed(3)}s · vel ${Math.round(first.velocity * 127)}`
    : `${selected.length} notes selected`;
}

function getSnapFraction() {
  const value = Number(document.getElementById("editor-snap")?.value ?? 0.25);
  return Number.isFinite(value) ? value : 0.25;
}

function getSnapSeconds() {
  const fraction = getSnapFraction();
  if (fraction <= 0) return 0;
  const bpm = Math.max(1, Number(Tone.Transport.bpm.value) || 120);
  return (60 / bpm) * fraction;
}

function snapTime(seconds) {
  const grid = getSnapSeconds();
  if (!grid) return Math.max(0, seconds);
  return Math.max(0, Math.round(seconds / grid) * grid);
}

function noteTop(midi) {
  return (currentHighPitch - midi) * currentRowHeight;
}

function noteHeight() {
  return Math.max(8, currentRowHeight - 2);
}

function refreshNoteElement(block, note) {
  block.style.left = `${note.time * editorScaleX}px`;
  block.style.top = `${noteTop(note.midi)}px`;
  block.style.width = `${Math.max(note.duration * editorScaleX, 8)}px`;
  block.style.height = `${noteHeight()}px`;
  block.style.setProperty("--note-velocity", String(note.velocity));
  const label = block.querySelector(".roll-note-label");
  if (label) label.textContent = note.name;
}

function refreshAllNoteElements() {
  content()?.querySelectorAll(".roll-note").forEach(block => {
    const index = Number(block.dataset.noteIndex);
    const note = currentNotes[index];
    if (note) refreshNoteElement(block, note);
  });
  updateSelectionInfo();
}

function computePitchRange() {
  if (!currentNotes.length) {
    currentLowPitch = 21;
    currentHighPitch = 108;
    return;
  }
  const values = currentNotes.map(n => n.midi);
  currentLowPitch = clamp(Math.min(21, Math.min(...values) - 3), 0, 120);
  currentHighPitch = clamp(Math.max(108, Math.max(...values) + 3), currentLowPitch + 12, 127);
}

function computeDuration() {
  editorMaxDuration = Math.max(
    1,
    ...currentNotes.map(note => note.time + note.duration)
  );
}

function drawEditorRuler(totalWidth) {
  const canvas = rulerCanvas();
  if (!canvas) return;
  const height = 32;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(totalWidth * dpr));
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${totalWidth}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, totalWidth, height);

  const bpm = Math.max(1, Number(Tone.Transport.bpm.value) || 120);
  const beatSeconds = 60 / bpm;
  const beatWidth = beatSeconds * editorScaleX;
  const beatsPerBar = 4;
  const totalBeats = Math.ceil(totalWidth / beatWidth);

  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.textBaseline = "top";
  for (let beat = 0; beat <= totalBeats; beat++) {
    const x = Math.round(beat * beatWidth) + 0.5;
    const isBar = beat % beatsPerBar === 0;
    ctx.strokeStyle = isBar ? "#4a5563" : "#2c333d";
    ctx.beginPath();
    ctx.moveTo(x, isBar ? 0 : 17);
    ctx.lineTo(x, height);
    ctx.stroke();
    if (isBar) {
      ctx.fillStyle = "#aab3be";
      ctx.fillText(String(Math.floor(beat / beatsPerBar) + 1), x + 5, 6);
    }
  }
}

function buildPitchRows(totalWidth) {
  const background = bg();
  const keys = sidebar();
  if (!background || !keys) return;
  background.innerHTML = "";
  keys.innerHTML = "";

  const rows = currentHighPitch - currentLowPitch + 1;
  const totalHeight = rows * currentRowHeight;
  background.style.width = `${totalWidth}px`;
  background.style.height = `${totalHeight}px`;
  keys.style.height = `${totalHeight}px`;

  const bpm = Math.max(1, Number(Tone.Transport.bpm.value) || 120);
  const beatWidth = (60 / bpm) * editorScaleX;
  const subWidth = beatWidth / 4;

  for (let midi = currentHighPitch; midi >= currentLowPitch; midi--) {
    const name = Tone.Frequency(midi, "midi").toNote();
    const black = name.includes("#");
    const y = noteTop(midi);

    const key = document.createElement("button");
    key.type = "button";
    key.className = `editor-piano-key ${black ? "black-key" : "white-key"}`;
    key.style.top = `${y}px`;
    key.style.height = `${currentRowHeight}px`;
    key.textContent = name;
    key.dataset.midi = String(midi);
    keys.appendChild(key);

    const row = document.createElement("div");
    row.className = `editor-grid-row ${black ? "is-black" : "is-white"} ${name.startsWith("C") ? "is-c" : ""}`;
    row.style.top = `${y}px`;
    row.style.height = `${currentRowHeight}px`;
    row.style.width = `${totalWidth}px`;
    row.style.backgroundSize = `${subWidth}px 100%, ${beatWidth * 4}px 100%`;
    background.appendChild(row);
  }
}

function createNoteBlock(note, index) {
  const block = document.createElement("div");
  block.className = `roll-note${selectedIndexes.has(index) ? " selected" : ""}`;
  block.dataset.noteIndex = String(index);
  block.tabIndex = 0;
  block.setAttribute("role", "button");
  block.setAttribute("aria-label", `${note.name}, ${note.time.toFixed(2)} seconds`);

  const label = document.createElement("span");
  label.className = "roll-note-label";
  label.textContent = note.name;
  block.appendChild(label);

  const handle = document.createElement("span");
  handle.className = "resize-handle";
  handle.dataset.editorHandle = "resize";
  block.appendChild(handle);
  refreshNoteElement(block, note);
  return block;
}

export function renderPianoRoll({ preserveView = false } = {}) {
  const roll = content();
  const background = bg();
  const keys = sidebar();
  const vp = viewport();
  if (!roll || !background || !keys || !vp) return;

  const oldLeft = preserveView ? vp.scrollLeft : 0;
  const oldTop = preserveView ? vp.scrollTop : 0;

  computePitchRange();
  computeDuration();

  const viewportWidth = Math.max(720, vp.clientWidth - 72);
  const totalWidth = Math.max(viewportWidth, Math.ceil((editorMaxDuration + 1) * editorScaleX));
  const totalHeight = (currentHighPitch - currentLowPitch + 1) * currentRowHeight;

  roll.innerHTML = "";
  roll.style.width = `${totalWidth}px`;
  roll.style.height = `${totalHeight}px`;
  document.getElementById("roll-canvas-wrapper")?.style.setProperty("width", `${totalWidth}px`);
  document.getElementById("roll-canvas-container")?.style.setProperty("height", `${totalHeight}px`);

  buildPitchRows(totalWidth);
  drawEditorRuler(totalWidth);
  currentNotes.forEach((note, index) => roll.appendChild(createNoteBlock(note, index)));

  if (playhead()) {
    playhead().style.display = "block";
    playhead().style.height = `${totalHeight}px`;
  }
  updateLoopOverlay();
  updateSelectionInfo();
  updateHistoryButtons();

  requestAnimationFrame(() => {
    if (preserveView) {
      vp.scrollLeft = oldLeft;
      vp.scrollTop = oldTop;
    } else {
      const focusMidi = currentNotes.length
        ? currentNotes.reduce((sum, n) => sum + n.midi, 0) / currentNotes.length
        : 60;
      vp.scrollTop = clamp(noteTop(Math.round(focusMidi)) - vp.clientHeight / 2, 0, totalHeight);
      vp.scrollLeft = 0;
    }
  });
}

function updateLoopOverlay() {
  const overlay = loopOverlay();
  if (!overlay) return;
  if (!editorLoopActive) {
    overlay.style.display = "none";
    return;
  }
  overlay.style.display = "block";
  overlay.style.left = `${loopStartSec * editorScaleX}px`;
  overlay.style.width = `${Math.max(1, (loopEndSec - loopStartSec) * editorScaleX)}px`;
}

function setSelection(next) {
  selectedIndexes = new Set([...next].filter(i => Number.isInteger(i) && i >= 0 && i < currentNotes.length));
  content()?.querySelectorAll(".roll-note").forEach(block => {
    block.classList.toggle("selected", selectedIndexes.has(Number(block.dataset.noteIndex)));
  });
  updateSelectionInfo();
}

function selectIndex(index, { additive = false, toggle = false } = {}) {
  const next = additive ? new Set(selectedIndexes) : new Set();
  if (toggle && next.has(index)) next.delete(index);
  else next.add(index);
  setSelection(next);
}

function selectedNoteIndexes() {
  return [...selectedIndexes].sort((a, b) => a - b);
}

function deleteSelectedNotes() {
  const indexes = selectedNoteIndexes();
  if (!indexes.length) return;
  pushUndoSnapshot();
  const remove = new Set(indexes);
  currentNotes = currentNotes.filter((_, index) => !remove.has(index));
  selectedIndexes.clear();
  renderPianoRoll({ preserveView: true });
}

function copySelectedNotes() {
  const indexes = selectedNoteIndexes();
  if (!indexes.length) return;
  const notes = indexes.map(index => currentNotes[index]).filter(Boolean);
  const anchor = Math.min(...notes.map(note => note.time));
  clipboardNotes = cloneNotes(notes).map(note => ({ ...note, time: note.time - anchor }));
}

function cutSelectedNotes() {
  copySelectedNotes();
  deleteSelectedNotes();
}

function pasteNotes() {
  if (!clipboardNotes.length) return;
  pushUndoSnapshot();
  const selected = selectedNoteIndexes().map(index => currentNotes[index]).filter(Boolean);
  const anchor = selected.length
    ? Math.max(...selected.map(note => note.time + note.duration))
    : Math.max(0, ...currentNotes.map(note => note.time + note.duration));
  const newIndexes = [];
  clipboardNotes.forEach(note => {
    newIndexes.push(currentNotes.length);
    currentNotes.push({ ...cloneNotes([note])[0], time: snapTime(anchor + note.time) });
  });
  selectedIndexes = new Set(newIndexes);
  renderPianoRoll({ preserveView: true });
}

function quantizeSelection() {
  const grid = getSnapSeconds();
  if (!grid) return;
  const indexes = selectedIndexes.size ? selectedNoteIndexes() : currentNotes.map((_, i) => i);
  if (!indexes.length) return;
  pushUndoSnapshot();
  indexes.forEach(index => {
    const note = currentNotes[index];
    note.time = snapTime(note.time);
  });
  renderPianoRoll({ preserveView: true });
}

function eventToContentPoint(event) {
  const roll = content();
  if (!roll) return { x: 0, y: 0 };
  const rect = roll.getBoundingClientRect();
  return {
    x: clamp(event.clientX - rect.left, 0, roll.offsetWidth),
    y: clamp(event.clientY - rect.top, 0, roll.offsetHeight)
  };
}

function addNoteAtEvent(event) {
  if (event.target.closest(".roll-note")) return;
  const point = eventToContentPoint(event);
  const midi = clamp(currentHighPitch - Math.floor(point.y / currentRowHeight), 0, 127);
  const beat = 60 / Math.max(1, Number(Tone.Transport.bpm.value) || 120);
  const duration = getSnapSeconds() || beat / 2;
  pushUndoSnapshot();
  const index = currentNotes.length;
  currentNotes.push({
    midi,
    name: Tone.Frequency(midi, "midi").toNote(),
    time: snapTime(point.x / editorScaleX),
    duration: Math.max(0.03, duration),
    velocity: 0.8
  });
  selectedIndexes = new Set([index]);
  renderPianoRoll({ preserveView: true });
}

async function auditionMidi(midi) {
  await ensureToneStarted();
  editorVoice.triggerAttackRelease(Tone.Frequency(midi, "midi").toNote(), "32n", Tone.immediate(), 0.7);
}

function beginNoteInteraction(event, block) {
  if (event.button !== 0) return;
  event.preventDefault();
  const index = Number(block.dataset.noteIndex);
  if (!Number.isInteger(index) || !currentNotes[index]) return;

  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  if (!selectedIndexes.has(index)) selectIndex(index, { additive, toggle: additive });
  else if (additive && !event.target.closest(".resize-handle")) selectIndex(index, { additive: true, toggle: true });
  if (!selectedIndexes.has(index)) return;

  const indexes = selectedNoteIndexes();
  interaction = {
    type: event.target.closest(".resize-handle") ? "resize" : "move",
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    indexes,
    originals: new Map(indexes.map(i => [i, { ...currentNotes[i] }])),
    before: snapshot(),
    historyCaptured: false,
    moved: false,
    anchorIndex: index
  };
  content()?.setPointerCapture?.(event.pointerId);
  auditionMidi(currentNotes[index].midi).catch(() => {});
}

function beginMarquee(event) {
  if (event.button !== 0 || event.target.closest(".roll-note")) return;
  const point = eventToContentPoint(event);
  if (!(event.shiftKey || event.ctrlKey || event.metaKey)) setSelection([]);
  const box = document.createElement("div");
  box.className = "editor-marquee";
  box.style.left = `${point.x}px`;
  box.style.top = `${point.y}px`;
  content()?.appendChild(box);
  interaction = {
    type: "marquee",
    pointerId: event.pointerId,
    startPoint: point,
    additive: event.shiftKey || event.ctrlKey || event.metaKey,
    baseSelection: new Set(selectedIndexes),
    box
  };
  content()?.setPointerCapture?.(event.pointerId);
}

function updateMarquee(event) {
  if (!interaction || interaction.type !== "marquee") return;
  const point = eventToContentPoint(event);
  const x = Math.min(interaction.startPoint.x, point.x);
  const y = Math.min(interaction.startPoint.y, point.y);
  const width = Math.abs(point.x - interaction.startPoint.x);
  const height = Math.abs(point.y - interaction.startPoint.y);
  Object.assign(interaction.box.style, {
    left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`
  });

  const next = interaction.additive ? new Set(interaction.baseSelection) : new Set();
  content()?.querySelectorAll(".roll-note").forEach(block => {
    const bx = parseFloat(block.style.left) || 0;
    const by = parseFloat(block.style.top) || 0;
    const bw = parseFloat(block.style.width) || 0;
    const bh = parseFloat(block.style.height) || 0;
    if (bx < x + width && bx + bw > x && by < y + height && by + bh > y) {
      next.add(Number(block.dataset.noteIndex));
    }
  });
  setSelection(next);
}

function captureDragHistory() {
  if (!interaction?.historyCaptured) {
    pushUndoSnapshot(interaction.before);
    interaction.historyCaptured = true;
  }
}

function updateNoteInteraction(event) {
  if (!interaction || !["move", "resize"].includes(interaction.type)) return;
  const dx = event.clientX - interaction.startX;
  const dy = event.clientY - interaction.startY;
  if (!interaction.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
  interaction.moved = true;
  captureDragHistory();

  if (interaction.type === "resize") {
    const delta = dx / editorScaleX;
    interaction.indexes.forEach(index => {
      const original = interaction.originals.get(index);
      currentNotes[index].duration = Math.max(0.02, snapTime(original.duration + delta) || 0.02);
    });
  } else {
    const anchorOriginal = interaction.originals.get(interaction.anchorIndex);
    const targetAnchorTime = snapTime(anchorOriginal.time + dx / editorScaleX);
    const snappedDeltaTime = targetAnchorTime - anchorOriginal.time;
    const deltaMidi = -Math.round(dy / currentRowHeight);
    interaction.indexes.forEach(index => {
      const original = interaction.originals.get(index);
      const note = currentNotes[index];
      note.time = Math.max(0, original.time + snappedDeltaTime);
      note.midi = clamp(original.midi + deltaMidi, currentLowPitch, currentHighPitch);
      note.name = Tone.Frequency(note.midi, "midi").toNote();
    });
  }
  refreshAllNoteElements();
}

function endInteraction(event) {
  if (!interaction) return;
  if (interaction.pointerId != null && event?.pointerId != null && interaction.pointerId !== event.pointerId) return;
  const wasNoteMove = ["move", "resize"].includes(interaction.type) && interaction.moved;
  interaction.box?.remove();
  interaction = null;
  if (wasNoteMove) renderPianoRoll({ preserveView: true });
}

function beginRulerInteraction(event) {
  if (event.button !== 0) return;
  const el = ruler();
  const vp = viewport();
  if (!el || !vp) return;
  event.preventDefault();
  const rect = el.getBoundingClientRect();
  const x = clamp(event.clientX - rect.left, 0, el.scrollWidth || el.clientWidth);
  const sec = x / editorScaleX;
  interaction = {
    type: "ruler",
    pointerId: event.pointerId,
    startX: event.clientX,
    startSec: sec,
    currentSec: sec,
    moved: false
  };
  el.setPointerCapture?.(event.pointerId);
}

function updateRulerInteraction(event) {
  if (!interaction || interaction.type !== "ruler") return;
  const el = ruler();
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = clamp(event.clientX - rect.left, 0, el.scrollWidth || el.clientWidth);
  const sec = Math.max(0, x / editorScaleX);
  interaction.currentSec = sec;
  if (Math.abs(event.clientX - interaction.startX) > 4) interaction.moved = true;
  if (interaction.moved) {
    editorLoopActive = true;
    loopStartSec = Math.min(interaction.startSec, sec);
    loopEndSec = Math.max(interaction.startSec, sec);
    updateLoopOverlay();
  }
}

function endRulerInteraction(event) {
  if (!interaction || interaction.type !== "ruler") return false;
  if (event?.pointerId != null && interaction.pointerId !== event.pointerId) return false;
  if (interaction.moved && loopEndSec - loopStartSec > 0.01) {
    editorPlayer.setLoop(true, loopStartSec, loopEndSec);
    editorPlayer.seek(loopStartSec);
  } else {
    editorLoopActive = false;
    editorPlayer.setLoop(false);
    editorPlayer.seek(interaction.startSec);
    updateLoopOverlay();
  }
  interaction = null;
  return true;
}

function setHorizontalZoom(next) {
  const vp = viewport();
  const centerTime = vp ? (vp.scrollLeft + vp.clientWidth / 2) / editorScaleX : 0;
  editorScaleX = clamp(next, 55, 420);
  renderPianoRoll({ preserveView: true });
  if (vp) vp.scrollLeft = Math.max(0, centerTime * editorScaleX - vp.clientWidth / 2);
}

function setVerticalZoom(next) {
  currentRowHeight = clamp(next, 12, 32);
  renderPianoRoll({ preserveView: true });
}

function commitCurrentEdits() {
  const committed = cloneNotes(currentNotes);
  if (currentEditingTarget === "imported") {
    applyEditedFileNotes(committed);
  } else if (currentEditingTarget === "recorded") {
    applyEditedRecordedNotes(committed);
  } else if (Array.isArray(sourceNotesRef)) {
    sourceNotesRef.splice(0, sourceNotesRef.length, ...committed);
  }
}

export function closeEditor({ commit = true } = {}) {
  if (commit) commitCurrentEdits();
  editorPlayer.stop();
  editorPlayer.setLoop(false);
  editorVoice.releaseAll();
  if (modal()) modal().style.display = "none";
  const play = document.getElementById("editor-btn-play");
  const stop = document.getElementById("editor-btn-stop");
  if (play) play.disabled = false;
  if (stop) stop.disabled = true;
  interaction?.box?.remove();
  interaction = null;
}

async function playEditor() {
  if (!currentNotes.length) return false;
  await ensureToneStarted();

  const events = currentNotes
    .map(note => ({
      time: Math.max(0, Number(note.time) || 0),
      note: note.name || Tone.Frequency(note.midi, "midi").toNote(),
      duration: Math.max(0.01, Number(note.duration) || 0.1),
      velocity: clamp(Number(note.velocity) || 0.8, 0.01, 1)
    }))
    .sort((a, b) => a.time - b.time);
  if (!events.length) return false;

  editorPlayer.setEvents(events, editorMaxDuration);
  editorPlayer.setLoop(editorLoopActive && loopEndSec > loopStartSec, loopStartSec, loopEndSec);
  let start = editorPlayer.getPosition();
  if (editorLoopActive && (start < loopStartSec || start >= loopEndSec)) start = loopStartSec;
  else if (!editorLoopActive && start >= editorMaxDuration - 0.01) start = 0;
  return editorPlayer.play(start);
}

function pauseEditor() {
  editorPlayer.pause();
  editorVoice.releaseAll();
}

function updatePlayheadLoop() {
  const isOpen = modal()?.style.display === "flex";
  if (isOpen) {
    const currentPos = editorPlayer.getPosition();
    if (playhead()) playhead().style.left = `${currentPos * editorScaleX}px`;
    const time = document.getElementById("editor-time-display");
    if (time) time.textContent = `${formatTime(currentPos)} / ${formatTime(editorMaxDuration)}`;
    if (editorPlayer.isPlaying() && !editorLoopActive && currentPos >= editorMaxDuration) {
      pauseEditor();
      editorPlayer.seek(0);
    }
  }
  playheadFrame = requestAnimationFrame(updatePlayheadLoop);
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe - mins * 60;
  return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
}

function handleEditorShortcuts(event) {
  if (modal()?.style.display !== "flex") return;
  const tag = event.target?.tagName?.toLowerCase();
  if (["input", "textarea", "select"].includes(tag) || event.target?.isContentEditable) return;

  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelectedNotes();
  } else if (mod && key === "a") {
    event.preventDefault();
    setSelection(currentNotes.map((_, index) => index));
  } else if (mod && key === "c") {
    event.preventDefault();
    copySelectedNotes();
  } else if (mod && key === "x") {
    event.preventDefault();
    cutSelectedNotes();
  } else if (mod && key === "v") {
    event.preventDefault();
    pasteNotes();
  } else if (mod && key === "z" && event.shiftKey) {
    event.preventDefault();
    redo();
  } else if (mod && key === "z") {
    event.preventDefault();
    undo();
  } else if (mod && key === "y") {
    event.preventDefault();
    redo();
  } else if (key === "q") {
    event.preventDefault();
    quantizeSelection();
  }
}

export function openEditor(notesArray, target = "external") {
  if (target === "imported") stopFile();
  if (target === "recorded") stopRecordingPlayback();
  editorPlayer.stop();

  currentEditingTarget = target;
  sourceNotesRef = Array.isArray(notesArray) ? notesArray : null;
  currentNotes = cloneNotes(notesArray);
  selectedIndexes.clear();
  clipboardNotes = [];
  undoStack.length = 0;
  redoStack.length = 0;
  editorLoopActive = false;
  loopStartSec = 0;
  loopEndSec = 0;
  editorPlayer.setLoop(false);
  editorPlayer.seek(0);

  const title = document.getElementById("editor-title");
  if (title) title.textContent = target === "recorded" ? "Recorded MIDI" : target === "imported" ? "Imported MIDI" : "MIDI Editor";
  if (modal()) modal().style.display = "flex";
  renderPianoRoll({ preserveView: false });
  return currentNotes;
}

function bindEditorControls() {
  if (editorBound) return;
  editorBound = true;

  document.getElementById("editor-btn-play")?.addEventListener("click", playEditor);
  document.getElementById("editor-btn-stop")?.addEventListener("click", pauseEditor);
  document.getElementById("editor-action-undo")?.addEventListener("click", undo);
  document.getElementById("editor-action-redo")?.addEventListener("click", redo);
  document.getElementById("editor-action-copy")?.addEventListener("click", copySelectedNotes);
  document.getElementById("editor-action-paste")?.addEventListener("click", pasteNotes);
  document.getElementById("editor-action-cut")?.addEventListener("click", cutSelectedNotes);
  document.getElementById("editor-action-delete")?.addEventListener("click", deleteSelectedNotes);
  document.getElementById("editor-action-quantize")?.addEventListener("click", quantizeSelection);
  document.getElementById("editor-zoom-out")?.addEventListener("click", () => setHorizontalZoom(editorScaleX / 1.2));
  document.getElementById("editor-zoom-in")?.addEventListener("click", () => setHorizontalZoom(editorScaleX * 1.2));
  document.getElementById("editor-row-smaller")?.addEventListener("click", () => setVerticalZoom(currentRowHeight - 2));
  document.getElementById("editor-row-larger")?.addEventListener("click", () => setVerticalZoom(currentRowHeight + 2));
  document.getElementById("editor-snap")?.addEventListener("change", () => drawEditorRuler(content()?.offsetWidth || 800));

  document.getElementById("editor-close")?.addEventListener("click", () => closeEditor({ commit: true }));
  document.querySelectorAll("[data-action='close-editor']").forEach(btn => btn.addEventListener("click", () => closeEditor({ commit: true })));

  content()?.addEventListener("pointerdown", event => {
    const block = event.target.closest(".roll-note");
    if (block) beginNoteInteraction(event, block);
    else beginMarquee(event);
  });
  content()?.addEventListener("dblclick", addNoteAtEvent);

  ruler()?.addEventListener("pointerdown", beginRulerInteraction);

  window.addEventListener("pointermove", event => {
    if (!interaction) return;
    if (interaction.type === "marquee") updateMarquee(event);
    else if (interaction.type === "ruler") updateRulerInteraction(event);
    else updateNoteInteraction(event);
  });
  window.addEventListener("pointerup", event => {
    if (endRulerInteraction(event)) return;
    endInteraction(event);
  });
  window.addEventListener("pointercancel", endInteraction);
  window.addEventListener("keydown", handleEditorShortcuts);

  sidebar()?.addEventListener("pointerdown", event => {
    const key = event.target.closest(".editor-piano-key");
    if (!key) return;
    auditionMidi(Number(key.dataset.midi)).catch(() => {});
  });

  window.addEventListener("resize", () => {
    if (modal()?.style.display === "flex") renderPianoRoll({ preserveView: true });
  });

  updateHistoryButtons();
  if (!playheadFrame) playheadFrame = requestAnimationFrame(updatePlayheadLoop);
}

export function bindMidiEditorUI() {
  bindEditorControls();

  document.getElementById("btn-open-file-editor")?.addEventListener("click", () => {
    const midi = getFileMidi();
    if (!midi) return;
    const notes = midi.tracks.flatMap(track => track.notes.map(note => ({
      midi: note.midi,
      name: note.name || Tone.Frequency(note.midi, "midi").toNote(),
      time: note.time,
      duration: note.duration,
      velocity: note.velocity
    }))).sort((a, b) => a.time - b.time || a.midi - b.midi);
    window.dispatchEvent(new CustomEvent("jubal:openEditor", { detail: { target: "imported", notes } }));
  });

  window.addEventListener("jubal:openEditor", event => openEditor(event.detail.notes, event.detail.target));
}
