// 8. MIDI Editor
// Reusable piano-roll renderer. Accepts an array of note objects and edits that array in place.
// Supports left-click selection/dragging, copy/paste/cut/delete, and undo/redo.

import { editorVoice, ensureToneStarted } from "./audio-core.js";
import { getFileMidi } from "./track-player.js";
import { getRecordedNotes } from "./sequencer.js";

let currentEditingTarget = null;
let currentNotes = [];
let editorPart = null;
let editorMaxDuration = 0;
let currentHighPitch = 127;
let currentRowHeight = 16;
let editorScaleX = 250;
let editorLoopActive = false;
let loopStartSec = 0;
let loopEndSec = 0;
let lastAuditionedNote = null;

const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 100;
let historyLocked = false;
let clipboardNotes = [];

const modal = () => document.getElementById("editor-modal");
const content = () => document.getElementById("roll-canvas-content");
const bg = () => document.getElementById("roll-canvas-bg");
const sidebar = () => document.getElementById("editor-keys-sidebar");
const playhead = () => document.getElementById("editor-playhead");
const rulerCanvas = () => document.getElementById("ruler-canvas");
const loopOverlay = () => document.getElementById("editor-loop-overlay");

function cloneNotes(notes) {
  return (notes || []).map(note => ({
    midi: Number(note.midi) || 0,
    name: note.name || Tone.Frequency(Number(note.midi) || 0, "midi").toNote(),
    time: Number(note.time) || 0,
    duration: Math.max(0.05, Number(note.duration) || 0.1),
    velocity: Number(note.velocity) || 0.8
  }));
}

function replaceCurrentNotes(nextNotes) {
  currentNotes.splice(0, currentNotes.length, ...cloneNotes(nextNotes));
  renderPianoRoll(currentNotes, { preserveHistory: true });
}

function pushUndoSnapshot() {
  if (historyLocked) return;
  undoStack.push(cloneNotes(currentNotes));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function withHistory(mutator) {
  pushUndoSnapshot();
  mutator();
  renderPianoRoll(currentNotes, { preserveHistory: true });
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(cloneNotes(currentNotes));
  const snapshot = undoStack.pop();
  historyLocked = true;
  replaceCurrentNotes(snapshot);
  historyLocked = false;
  updateHistoryButtons();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(cloneNotes(currentNotes));
  const snapshot = redoStack.pop();
  historyLocked = true;
  replaceCurrentNotes(snapshot);
  historyLocked = false;
  updateHistoryButtons();
}

function selectedBlocks() {
  return Array.from(document.querySelectorAll("#roll-canvas-content .roll-note.selected"));
}

function selectedNoteIndexes() {
  const blocks = selectedBlocks();
  const indices = [];
  blocks.forEach(block => {
    const index = Number(block.dataset.noteIndex);
    if (Number.isInteger(index) && index >= 0 && index < currentNotes.length) indices.push(index);
  });
  return [...new Set(indices)].sort((a, b) => a - b);
}

function clearNoteSelection() {
  selectedBlocks().forEach(block => block.classList.remove("selected"));
}

function selectBlock(block, additive = false) {
  if (!additive) clearNoteSelection();
  block.classList.add("selected");
}

function deleteSelectedNotes() {
  const indexes = selectedNoteIndexes();
  if (!indexes.length) return;
  withHistory(() => {
    const removeSet = new Set(indexes);
    const kept = currentNotes.filter((_, index) => !removeSet.has(index));
    currentNotes.splice(0, currentNotes.length, ...kept);
  });
}

function copySelectedNotes() {
  const indexes = selectedNoteIndexes();
  if (!indexes.length) return;
  const notes = indexes.map(index => currentNotes[index]).filter(Boolean);
  const anchor = Math.min(...notes.map(note => Number(note.time) || 0));
  clipboardNotes = notes.map(note => ({
    ...cloneNotes([note])[0],
    time: Math.max(0, (Number(note.time) || 0) - anchor)
  }));
}

function cutSelectedNotes() {
  copySelectedNotes();
  deleteSelectedNotes();
}

function pasteNotes() {
  if (!clipboardNotes.length) return;
  const selected = selectedNoteIndexes().map(index => currentNotes[index]).filter(Boolean);
  const pasteAnchor = selected.length
    ? Math.max(...selected.map(note => (Number(note.time) || 0) + (Number(note.duration) || 0))) + 0.1
    : Math.max(0, ...currentNotes.map(note => (Number(note.time) || 0) + (Number(note.duration) || 0)));

  withHistory(() => {
    const pasted = clipboardNotes.map(note => ({
      ...cloneNotes([note])[0],
      time: pasteAnchor + (Number(note.time) || 0)
    }));
    currentNotes.push(...pasted);
  });
}

function updateHistoryButtons() {
  const undoButton = document.getElementById("editor-action-undo");
  const redoButton = document.getElementById("editor-action-redo");
  if (undoButton) undoButton.disabled = undoStack.length === 0;
  if (redoButton) redoButton.disabled = redoStack.length === 0;
}

function ensureEditorActions() {
  const toolbar = document.querySelector("#editor-modal .editor-toolbar");
  if (!toolbar || toolbar.dataset.actionsBound === "true") return;

  const actions = document.createElement("div");
  actions.className = "editor-actions";
  actions.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
  actions.innerHTML = `
    <button type="button" id="editor-action-undo" title="Undo (Ctrl/Cmd+Z)">↶ Undo</button>
    <button type="button" id="editor-action-redo" title="Redo (Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z)">↷ Redo</button>
    <button type="button" id="editor-action-copy" title="Copy selected notes (Ctrl/Cmd+C)">Copy</button>
    <button type="button" id="editor-action-paste" title="Paste notes (Ctrl/Cmd+V)">Paste</button>
    <button type="button" id="editor-action-cut" title="Cut selected notes (Ctrl/Cmd+X)">Cut</button>
    <button type="button" id="editor-action-delete" title="Delete selected notes (Delete/Backspace)">Delete</button>
  `;

  toolbar.appendChild(actions);
  document.getElementById("editor-action-undo")?.addEventListener("click", undo);
  document.getElementById("editor-action-redo")?.addEventListener("click", redo);
  document.getElementById("editor-action-copy")?.addEventListener("click", copySelectedNotes);
  document.getElementById("editor-action-paste")?.addEventListener("click", pasteNotes);
  document.getElementById("editor-action-cut")?.addEventListener("click", cutSelectedNotes);
  document.getElementById("editor-action-delete")?.addEventListener("click", deleteSelectedNotes);
  toolbar.dataset.actionsBound = "true";
  updateHistoryButtons();
}

function handleEditorShortcuts(e) {
  if (!modal() || modal().style.display !== "flex") return;
  const target = e.target;
  const tag = target?.tagName?.toLowerCase();
  const typing = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
  if (typing) return;

  const mod = e.ctrlKey || e.metaKey;
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    deleteSelectedNotes();
    return;
  }
  if (!mod) return;

  const key = e.key.toLowerCase();
  if (key === "c") {
    e.preventDefault();
    copySelectedNotes();
  } else if (key === "x") {
    e.preventDefault();
    cutSelectedNotes();
  } else if (key === "v") {
    e.preventDefault();
    pasteNotes();
  } else if (key === "z" && e.shiftKey) {
    e.preventDefault();
    redo();
  } else if (key === "z") {
    e.preventDefault();
    undo();
  } else if (key === "y") {
    e.preventDefault();
    redo();
  }
}

function drawEditorRuler(totalWidth) {
  const canvas = rulerCanvas();
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = totalWidth;
  canvas.height = 35;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#888";
  ctx.font = '10px "Orbitron"';
  for (let sec = 0; sec <= Math.ceil(totalWidth / editorScaleX); sec++) {
    const x = sec * editorScaleX;
    ctx.fillRect(x, 25, 1, 10);
    ctx.fillText(`${sec}s`, x + 4, 32);
    for (let j = 1; j < 4; j++) ctx.fillRect(x + j * editorScaleX / 4, 30, 1, 5);
  }
}

function wireEditorTimeline() {
  const ruler = document.getElementById("editor-timeline-ruler");
  if (!ruler || ruler.dataset.bound === "true") return;
  ruler.dataset.bound = "true";
  let dragging = false;
  let dragStart = 0;

  ruler.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    const rect = ruler.getBoundingClientRect();
    const x = e.clientX - rect.left + document.getElementById("roll-viewport").scrollLeft - 80;
    if (x < 0) return;
    dragging = true;
    dragStart = x / editorScaleX;
    Tone.Transport.seconds = dragStart;
    editorLoopActive = false;
    Tone.Transport.loop = false;
    if (loopOverlay()) loopOverlay().style.display = "none";
  });

  window.addEventListener("mousemove", e => {
    if (!dragging) return;
    const rect = ruler.getBoundingClientRect();
    const x = e.clientX - rect.left + document.getElementById("roll-viewport").scrollLeft - 80;
    const sec = Math.max(0, x / editorScaleX);
    if (Math.abs(sec - dragStart) > 0.1) {
      editorLoopActive = true;
      loopStartSec = Math.min(dragStart, sec);
      loopEndSec = Math.max(dragStart, sec);
      if (loopOverlay()) {
        loopOverlay().style.display = "block";
        loopOverlay().style.left = `${loopStartSec * editorScaleX}px`;
        loopOverlay().style.width = `${(loopEndSec - loopStartSec) * editorScaleX}px`;
      }
    }
  });

  window.addEventListener("mouseup", () => {
    if (dragging && editorLoopActive) {
      Tone.Transport.setLoopPoints(loopStartSec, loopEndSec);
      Tone.Transport.loop = true;
      Tone.Transport.seconds = loopStartSec;
    }
    dragging = false;
  });
}

export function renderPianoRoll(notesArray, { preserveHistory = false } = {}) {
  ensureEditorActions();
  if (!preserveHistory) {
    currentNotes = notesArray || [];
  } else if (notesArray && notesArray !== currentNotes) {
    currentNotes = notesArray;
  }

  const roll = content();
  const background = bg();
  const keySidebar = sidebar();
  if (!roll || !background || !keySidebar) return;

  roll.innerHTML = "";
  background.innerHTML = "";
  if (playhead()) playhead().style.display = "block";
  if (!currentNotes.length) currentNotes = [{ midi: 60, name: "C4", time: 0, duration: 1, velocity: 0.8 }];

  const validNotes = cloneNotes(currentNotes);
  currentNotes.splice(0, currentNotes.length, ...validNotes);

  const minMidi = Math.min(...validNotes.map(n => n.midi));
  const maxMidi = Math.max(...validNotes.map(n => n.midi));
  const lowPitch = Math.max(0, minMidi - 6);
  currentHighPitch = Math.min(127, maxMidi + 6);
  const totalRows = currentHighPitch - lowPitch + 1;

  keySidebar.innerHTML = "";
  keySidebar.style.height = `${totalRows * currentRowHeight}px`;

  for (let midi = currentHighPitch; midi >= lowPitch; midi--) {
    const noteName = Tone.Frequency(midi, "midi").toNote();
    const black = noteName.includes("#");
    const y = (currentHighPitch - midi) * currentRowHeight;

    const key = document.createElement("div");
    key.className = `editor-piano-key ${black ? "black-key" : "white-key"}`;
    key.style.top = `${y}px`;
    key.style.height = `${currentRowHeight}px`;
    key.innerText = noteName;
    key.addEventListener("mousedown", async e => {
      if (e.button !== 0) return;
      await ensureToneStarted();
      editorVoice.triggerAttackRelease(noteName, "8n");
    });
    keySidebar.appendChild(key);

    const row = document.createElement("div");
    row.style.cssText = `position:absolute;top:${y}px;width:100%;height:${currentRowHeight}px;background:${black ? "#1a1a1a" : "#262626"};border-bottom:1px solid #111;box-sizing:border-box`;
    background.appendChild(row);
  }

  editorMaxDuration = validNotes.reduce((max, n) => Math.max(max, n.time + n.duration), 1);
  const totalWidth = Math.max(800, editorMaxDuration * editorScaleX + 100);
  roll.style.width = `${totalWidth}px`;
  roll.style.height = `${totalRows * currentRowHeight}px`;
  background.style.width = `${totalWidth}px`;
  drawEditorRuler(totalWidth);
  wireEditorTimeline();

  validNotes.forEach((note, index) => {
    const block = document.createElement("div");
    block.className = "roll-note";
    block.dataset.noteIndex = String(index);
    block.style.top = `${(currentHighPitch - note.midi) * currentRowHeight}px`;
    block.style.left = `${note.time * editorScaleX}px`;
    block.style.width = `${Math.max(note.duration * editorScaleX, 15)}px`;
    block.style.height = `${currentRowHeight - 2}px`;
    block.innerText = note.name;
    block.title = "Left-click to select; drag to move; Shift-click for multi-select";

    const handle = document.createElement("div");
    handle.className = "resize-handle";
    block.appendChild(handle);

    let dragging = false;
    let resizing = false;
    let startX = 0;
    let startY = 0;
    let initialTime = note.time;
    let initialDuration = note.duration;
    let initialMidi = note.midi;
    let historyCaptured = false;
    let moved = false;

    handle.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      e.stopPropagation();
      pushUndoSnapshot();
      historyCaptured = true;
      resizing = true;
      startX = e.clientX;
      initialDuration = note.duration;
    });

    block.addEventListener("mousedown", async e => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (resizing) return;

      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      selectBlock(block, additive);
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      initialTime = note.time;
      initialMidi = note.midi;
      historyCaptured = false;

      await ensureToneStarted();
      editorVoice.triggerAttackRelease(note.name, "8n");
    });

    const onMove = e => {
      if (!resizing && !dragging) return;

      if (Math.abs(e.clientX - startX) > 2 || Math.abs(e.clientY - startY) > 2) {
        moved = true;
        if (!historyCaptured) {
          pushUndoSnapshot();
          historyCaptured = true;
        }
      }

      if (resizing) {
        note.duration = Math.max(0.05, initialDuration + (e.clientX - startX) / editorScaleX);
        block.style.width = `${Math.max(note.duration * editorScaleX, 15)}px`;
      } else if (dragging) {
        note.time = Math.max(0, initialTime + (e.clientX - startX) / editorScaleX);
        const midiDelta = Math.round((e.clientY - startY) / currentRowHeight);
        note.midi = Math.max(0, Math.min(127, initialMidi - midiDelta));
        note.name = Tone.Frequency(note.midi, "midi").toNote();
        block.style.left = `${note.time * editorScaleX}px`;
        block.style.top = `${(currentHighPitch - note.midi) * currentRowHeight}px`;
        block.innerText = note.name;
        block.appendChild(handle);
        if (lastAuditionedNote !== note.name) {
          ensureToneStarted().then(() => editorVoice.triggerAttackRelease(note.name, "16n"));
          lastAuditionedNote = note.name;
        }
      }
    };

    const onUp = () => {
      if (historyCaptured && !moved) {
        if (undoStack.length) undoStack.pop();
        updateHistoryButtons();
      }
      dragging = false;
      resizing = false;
      historyCaptured = false;
      moved = false;
      lastAuditionedNote = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    roll.appendChild(block);
  });

  if (roll.dataset.blankSelectionBound !== "true") {
    roll.addEventListener("mousedown", e => {
      if (e.button !== 0 || e.target.closest(".roll-note")) return;
      clearNoteSelection();
    });
    roll.dataset.blankSelectionBound = "true";
  }
}

export function openEditor(notesArray, target = "external") {
  currentEditingTarget = target;
  currentNotes = notesArray || [];
  undoStack.length = 0;
  redoStack.length = 0;
  clipboardNotes = [];
  renderPianoRoll(currentNotes);
  ensureEditorActions();
  updateHistoryButtons();
  if (modal()) modal().style.display = "flex";
  return currentNotes;
}

export function closeEditor() {
  Tone.Transport.pause();
  Tone.Transport.loop = false;
  if (modal()) modal().style.display = "none";
  document.getElementById("editor-btn-play")?.removeAttribute("disabled");
  const stop = document.getElementById("editor-btn-stop");
  if (stop) stop.disabled = true;
}

async function playEditor() {
  await ensureToneStarted();
  Tone.Transport.cancel(0);
  if (editorPart) editorPart.dispose();
  if (Tone.Transport.seconds >= editorMaxDuration && !editorLoopActive) Tone.Transport.seconds = 0;

  const events = currentNotes.map(n => ({
    time: Number(n.time) || 0,
    notes: [n.name],
    duration: Number(n.duration) || 0.1
  }));
  editorPart = new Tone.Part((time, event) => editorVoice.triggerAttackRelease(event.notes, event.duration, time), events).start(0);
  Tone.Transport.start();
  document.getElementById("editor-btn-play")?.setAttribute("disabled", "true");
  const stop = document.getElementById("editor-btn-stop");
  if (stop) stop.disabled = false;
}

export function bindMidiEditorUI() {
  ensureEditorActions();
  window.addEventListener("keydown", handleEditorShortcuts);

  document.getElementById("btn-open-file-editor")?.addEventListener("click", () => {
    const midi = getFileMidi();
    if (!midi) return;
    const track = midi.tracks.find(t => t.notes.length > 0) || midi.tracks[0];
    const notes = track?.notes?.map(n => ({ midi: n.midi, name: n.name, time: n.time, duration: n.duration, velocity: n.velocity })) || [];
    window.dispatchEvent(new CustomEvent("jubal:openEditor", { detail: { target: "imported", notes } }));
  });

  document.getElementById("editor-btn-play")?.addEventListener("click", playEditor);
  document.getElementById("editor-btn-stop")?.addEventListener("click", () => {
    Tone.Transport.pause();
    const play = document.getElementById("editor-btn-play");
    const stop = document.getElementById("editor-btn-stop");
    if (play) play.disabled = false;
    if (stop) stop.disabled = true;
  });

  window.addEventListener("jubal:openEditor", e => openEditor(e.detail.notes, e.detail.target));

  document.getElementById("editor-close")?.addEventListener("click", closeEditor);

  setInterval(() => {
    if (!modal()?.matches(":not([style*='display: flex'])")) {
      const currentPos = Tone.Transport.seconds;
      const px = Math.min(editorMaxDuration * editorScaleX, currentPos * editorScaleX);
      if (playhead()) playhead().style.left = `${px}px`;
      const time = document.getElementById("editor-time-display");
      if (time) time.innerText = `Time: ${currentPos.toFixed(1)}s`;
      if (Tone.Transport.state === "started" && !editorLoopActive && currentPos >= editorMaxDuration) {
        document.getElementById("editor-btn-stop")?.click();
        Tone.Transport.seconds = 0;
      }
    }
  }, 30);
}

// Keep this import intentionally referenced so the module can be extended
// to switch targets without changing the reusable renderer API.
void getRecordedNotes;
