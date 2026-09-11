// 5. Arranger Engine
// Internal scheduler state is fully local to this module.

import { activeDrumKit, ensureToneStarted } from "./audio-core.js";

let arrIsPlaying = false;
let arrSyncStart = false;
let arrActiveStyle = "4_4";
let arrCurrentSec = "mainA";
let arrQueuedSec = "mainA";
let arrFillActive = false;
let arrCurrentStep = 0;
let arrNextNoteTime = 0.0;
let arrTimerID = null;

function generateStyle(name, totalSteps, kicks, snares, hats) {
  const style = { name, steps: totalSteps, intro: [], mainA: [], mainB: [], fill: [], ending: [] };
  for (let i = 0; i < totalSteps; i++) {
    const isKick = kicks.includes(i);
    const isSnare = snares.includes(i);
    const isHat = hats.includes(i);
    const da = [];
    if (isKick) da.push(1);
    if (isSnare) da.push(2);
    if (isHat) da.push(3);
    style.mainA.push({ D: da });
    const db = [...da];
    if (i % 2 !== 0 && !db.includes(3)) db.push(3);
    style.mainB.push({ D: db });
    style.fill.push({ D: [2] });
    style.intro.push({ D: i === 0 ? [1, 4] : [] });
    style.ending.push({ D: i === 0 ? [1, 2, 4] : [] });
  }
  return style;
}

export const stylesLib = {
  "4_4": generateStyle("4-4 Worship/Pop", 16, [0, 8], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14]),
  "2_4": generateStyle("2-4 March/Praise", 8, [0, 4], [2, 6], [0, 2, 4, 6]),
  "4_2": generateStyle("4-2 Praise/Gospel", 12, [0, 6], [3, 9], [0, 1, 3, 4, 6, 7, 9, 10]),
  "6_8": generateStyle("6-8 Worship", 12, [0, 6], [3, 9], [0, 2, 4, 6, 8, 10]),
  "12_8": generateStyle("12-8 Gospel Shuffle", 24, [0, 12], [6, 18], [0, 3, 6, 9, 12, 15, 18, 21])
};

export function getArrangerState() {
  return { isPlaying: arrIsPlaying, syncStart: arrSyncStart, style: arrActiveStyle, currentSection: arrCurrentSec, queuedSection: arrQueuedSec, fill: arrFillActive };
}

function updateArrangerUI() {
  const status = document.getElementById("arr-status");
  if (status) {
    status.innerText = arrSyncStart
      ? "ARRANGER: SYNC WAIT"
      : arrIsPlaying
        ? (arrFillActive ? "ARRANGER: FILL" : `ARRANGER: ${arrCurrentSec.toUpperCase()}`)
        : "ARRANGER: STOPPED";
  }

  const syncBtn = document.getElementById("btn-arr-sync");
  if (syncBtn) syncBtn.className = arrSyncStart ? "primary listening" : "";

  document.querySelectorAll(".arr-section-btn").forEach(btn => {
    btn.classList.remove("primary");
    if (btn.dataset.section === arrCurrentSec && arrIsPlaying) btn.classList.add("primary");
    else if (btn.dataset.section === arrQueuedSec && !arrIsPlaying) btn.classList.add("primary");
  });
}

export function scheduleArrangerNote(step, time) {
  const style = stylesLib[arrActiveStyle];
  const pattern = arrFillActive ? "fill" : arrCurrentSec;
  const d = style[pattern]?.[step]?.D || [];

  if (d.includes(1)) activeDrumKit[36]?.triggerAttackRelease("C2", "8n", time, 1.2);
  if (d.includes(2)) activeDrumKit[38]?.triggerAttackRelease("8n", time, 1.0);
  if (d.includes(3)) activeDrumKit[42]?.triggerAttackRelease("32n", time, 0.4);
  if (d.includes(4)) activeDrumKit[39]?.triggerAttackRelease("32n", time, 0.7);

  Tone.Draw.schedule(() => {
    const pulse = style.steps >= 16 ? 4 : (style.steps === 12 ? 3 : 2);
    if (step % pulse === 0) {
      const el = document.getElementById("arr-beat");
      if (el) el.innerText = Math.floor(step / pulse) + 1;
    }
  }, time);

  if (step === style.steps - 1) {
    if (arrCurrentSec === "ending" && !arrFillActive) {
      setTimeout(stopArranger, Math.max(0, (time - Tone.now()) * 1000));
    } else {
      arrCurrentSec = arrQueuedSec;
      if (arrFillActive) {
        arrFillActive = false;
        Tone.Draw.schedule(updateArrangerUI, time);
      }
    }
    Tone.Draw.schedule(updateArrangerUI, time);
  }
}

function nextArrangerNote() {
  const mult = stylesLib[arrActiveStyle].steps > 16 ? 0.166 : 0.25;
  const currentTempo = Tone.Transport.bpm.value || 120;
  arrNextNoteTime += mult * (60 / currentTempo);
  arrCurrentStep = (arrCurrentStep + 1) % stylesLib[arrActiveStyle].steps;
}

export function arrangerScheduler() {
  while (arrNextNoteTime < Tone.now() + 0.1) {
    scheduleArrangerNote(arrCurrentStep, arrNextNoteTime);
    nextArrangerNote();
  }
  arrTimerID = setTimeout(arrangerScheduler, 25);
}

export async function startArranger() {
  await ensureToneStarted();
  if (arrIsPlaying) return;
  arrIsPlaying = true;
  arrSyncStart = false;
  arrCurrentSec = arrFillActive ? "fill" : arrQueuedSec;
  arrCurrentStep = 0;
  arrNextNoteTime = Tone.now() + 0.05;
  arrangerScheduler();
  updateArrangerUI();
}

export function stopArranger() {
  arrIsPlaying = false;
  arrFillActive = false;
  arrSyncStart = false;
  if (arrTimerID) clearTimeout(arrTimerID);
  arrTimerID = null;
  const beat = document.getElementById("arr-beat");
  if (beat) beat.innerText = "-";
  updateArrangerUI();
}

export function selectArrangerSection(section) {
  if (!stylesLib["4_4"] || !["intro", "mainA", "mainB", "ending"].includes(section)) return;
  arrQueuedSec = section;
  if (!arrIsPlaying && arrSyncStart) startArranger();
  else updateArrangerUI();
}

export function setArrangerStyle(style) {
  if (!stylesLib[style]) return;
  arrActiveStyle = style;
  if (arrIsPlaying) arrCurrentStep = 0;
  updateArrangerUI();
}

export function toggleArrangerSync() {
  if (arrIsPlaying) stopArranger();
  arrSyncStart = !arrSyncStart;
  updateArrangerUI();
}

export function triggerFill() {
  if (arrIsPlaying && !arrFillActive) {
    arrFillActive = true;
    updateArrangerUI();
  } else if (!arrIsPlaying && arrSyncStart) {
    arrFillActive = true;
    startArranger();
  }
}

export function bindArrangerUI() {
  document.getElementById("arr-style")?.addEventListener("change", e => setArrangerStyle(e.target.value));
  document.getElementById("btn-arr-start")?.addEventListener("click", () => arrIsPlaying ? stopArranger() : startArranger());
  document.getElementById("btn-arr-sync")?.addEventListener("click", toggleArrangerSync);
  document.getElementById("btn-arr-fill")?.addEventListener("click", triggerFill);
  document.querySelectorAll(".arr-section-btn").forEach(btn => {
    btn.addEventListener("click", () => selectArrangerSection(btn.dataset.section));
  });
  updateArrangerUI();
}
