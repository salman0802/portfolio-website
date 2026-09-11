// 2. Audio Core
// Owns the single Tone.js graph and all shared synth instances.

export const masterFilter = new Tone.Filter(20000, "lowpass").toDestination();
export const masterReverb = new Tone.Reverb({ decay: 2, wet: 0.1 }).connect(masterFilter);
export const masterDelay = new Tone.FeedbackDelay("8n", 0.2).connect(masterReverb);
masterDelay.wet.value = 0;
export const masterChorus = new Tone.Chorus(4, 2.5, 0.5).connect(masterDelay);
masterChorus.wet.value = 0;
export const mainBus = new Tone.Volume(0).connect(masterChorus);

export const voices = {
  grand: new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.005, decay: 2.5, sustain: 0.1, release: 1.2 }
  }).connect(mainBus),
  "warm-ep": new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 1.0, modulationIndex: 2.0,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 2.0, sustain: 0.3, release: 0.8 }
  }).connect(mainBus),
  strings: new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.4, decay: 1.0, sustain: 0.8, release: 2.0 }
  }).connect(mainBus),
  accordion: new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "square8" },
    envelope: { attack: 0.08, decay: 0.3, sustain: 0.9, release: 0.5 }
  }).connect(mainBus),
  bansuri: new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 1.5, oscillator: { type: "sine" },
    envelope: { attack: 0.15, decay: 0.3, sustain: 0.8, release: 0.6 }
  }).connect(mainBus),
  recorder: new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.04, decay: 0.1, sustain: 0.9, release: 0.2 }
  }).connect(mainBus),
  bass: new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.02, decay: 0.8, sustain: 0.4, release: 0.5 }
  }).connect(mainBus),
  choir: new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 0.5, modulationIndex: 1.0,
    oscillator: { type: "sine" },
    envelope: { attack: 0.3, decay: 1.5, sustain: 0.8, release: 1.5 }
  }).connect(mainBus)
};

export const editorVoice = new Tone.PolySynth(Tone.Synth).toDestination();

export const activeDrumKit = {
  36: new Tone.MembraneSynth({
    pitchDecay: 0.05, octaves: 4, oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.4 }
  }).connect(mainBus),
  38: new Tone.NoiseSynth({
    noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.2 }
  }).connect(mainBus),
  39: new Tone.MetalSynth({
    frequency: 200, envelope: { attack: 0.001, decay: 0.4, release: 0.2 }
  }).connect(mainBus),
  42: new Tone.MetalSynth({
    frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.01 }
  }).connect(mainBus)
};

export const metronomeSynth = new Tone.MembraneSynth({
  envelope: { attack: 0.001, decay: 0.1 }
}).toDestination();

let activeLiveVoice = voices.grand;
let activeLearnVoice = voices.grand;
let activeAccompanimentVoice = voices["warm-ep"];

export function getActiveVoices() {
  return { activeLiveVoice, activeLearnVoice, activeAccompanimentVoice };
}

export function setActiveLiveVoice(nameOrVoice) {
  activeLiveVoice = typeof nameOrVoice === "string" ? (voices[nameOrVoice] || voices.grand) : nameOrVoice;
  return activeLiveVoice;
}

export function setActiveLearnVoice(nameOrVoice) {
  activeLearnVoice = typeof nameOrVoice === "string" ? (voices[nameOrVoice] || voices.grand) : nameOrVoice;
  return activeLearnVoice;
}

export function setActiveAccompanimentVoice(nameOrVoice) {
  activeAccompanimentVoice = typeof nameOrVoice === "string"
    ? (voices[nameOrVoice] || voices["warm-ep"])
    : nameOrVoice;
  return activeAccompanimentVoice;
}

export async function ensureToneStarted() {
  if (Tone.context.state !== "running") await Tone.start();
}

export function triggerNotes(voice, notes, { time = Tone.now(), velocity = 0.8, source = "app" } = {}) {
  voice.triggerAttack(notes, time, velocity);
  return { voice, notes, source };
}

export function releaseNotes(voice, notes, time = Tone.now()) {
  voice.triggerRelease(notes, time);
}

const activeRoutes = new Map();

export function playRoutedNotes({ sourceId, notes, voice, velocity = 0.8, source = "keyboard" }) {
  const route = { notes: [...notes], voice, source };
  activeRoutes.set(sourceId, route);
  triggerNotes(voice, route.notes, { time: Tone.now(), velocity, source });
  return route;
}

export function releaseRoutedNotes(sourceId) {
  const route = activeRoutes.get(sourceId);
  if (!route) return null;
  releaseNotes(route.voice, route.notes);
  activeRoutes.delete(sourceId);
  return route;
}

export function getActiveRoute(sourceId) {
  return activeRoutes.get(sourceId) || null;
}

export function handleSynthCC(ccNum, value) {
  const norm = value / 127;
  switch (ccNum) {
    case 70: masterFilter.frequency.value = norm * 19800 + 200; break;
    case 71: masterFilter.Q.value = norm * 10; break;
    case 72: masterReverb.decay = norm * 5 + 0.1; break;
    case 73: masterReverb.wet.value = norm; break;
    case 74: masterDelay.delayTime.value = norm; break;
    case 75: masterDelay.feedback.value = norm * 0.9; break;
    case 76: masterChorus.wet.value = norm; break;
    case 77: mainBus.volume.value = (norm * 40) - 30; break;
    default: return false;
  }
  const knobIdx = ccNum - 70;
  const el = document.getElementById(`knob-${knobIdx}`);
  if (el) {
    el.querySelector(".cc-knob-indicator")?.style.setProperty(
      "transform", `translateX(-50%) rotate(${norm * 270 - 135}deg)`
    );
  }
  return true;
}
