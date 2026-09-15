// Reliable look-ahead scheduler for imported/edited MIDI playback.
// It deliberately does not use Tone.Transport. Live key input and the arranger/metronome
// can keep their own timing models without starving file/editor playback.

import { ensureToneStarted } from "./audio-core.js";

const LOOKAHEAD_SECONDS = 0.055;
const TICK_MS = 12;
const START_LEAD_SECONDS = 0.025;
const MIN_EVENT_LEAD_SECONDS = 0.006;

const players = new Set();
let activePlayer = null;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const audioNow = () => {
  if (typeof Tone?.immediate === "function") return Tone.immediate();
  if (typeof Tone?.now === "function") return Tone.now();
  return performance.now() / 1000;
};

function findEventIndex(events, position) {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((Number(events[mid]?.time) || 0) < position - 1e-5) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function normalizeEvents(events = []) {
  return events
    .map((event, index) => ({
      ...event,
      __index: index,
      time: Math.max(0, Number(event?.time) || 0),
      duration: Math.max(0.01, Number(event?.duration) || 0.1)
    }))
    .sort((a, b) => a.time - b.time || a.__index - b.__index);
}

export function createPlaybackEngine({
  scheduleAudio,
  releaseAudio,
  onEventStart,
  onEventEnd,
  onPosition,
  onStateChange,
  onEnded
} = {}) {
  let events = [];
  let duration = 0;
  let position = 0;
  let playing = false;
  let timer = null;
  let nextIndex = 0;
  let basePosition = 0;
  let baseAudioTime = 0;
  let loopEnabled = false;
  let loopStart = 0;
  let loopEnd = 0;
  let playbackRate = 1;
  const uiTimers = new Set();

  function clearUiTimers() {
    uiTimers.forEach(id => clearTimeout(id));
    uiTimers.clear();
  }

  function scheduleUi(callback, event, when) {
    if (typeof callback !== "function") return;
    const delay = Math.max(0, (when - audioNow()) * 1000);
    const id = setTimeout(() => {
      uiTimers.delete(id);
      callback(event);
    }, delay);
    uiTimers.add(id);
  }

  function rawPosition(now = audioNow()) {
    if (!playing) return position;
    return basePosition + Math.max(0, now - baseAudioTime) * playbackRate;
  }

  function currentPosition(now = audioNow()) {
    const pos = rawPosition(now);
    if (loopEnabled && loopEnd > loopStart && pos >= loopEnd) return loopEnd;
    return clamp(pos, 0, Math.max(duration, loopEnd, 0));
  }

  function emitState() {
    onStateChange?.({ playing, position: currentPosition(), duration, loopEnabled, loopStart, loopEnd, playbackRate });
  }

  function armFrom(nextPosition, lead = START_LEAD_SECONDS) {
    position = clamp(Number(nextPosition) || 0, 0, Math.max(duration, 0));
    basePosition = position;
    baseAudioTime = audioNow() + lead;
    nextIndex = findEventIndex(events, position);
  }

  function performLoop(now) {
    clearUiTimers();
    releaseAudio?.();
    const overshoot = Math.max(0, rawPosition(now) - loopEnd);
    const loopLength = Math.max(0.01, loopEnd - loopStart);
    const nextPos = loopStart + (overshoot % loopLength);
    armFrom(nextPos, MIN_EVENT_LEAD_SECONDS);
  }

  function finishNaturally() {
    playing = false;
    position = duration;
    if (timer) clearInterval(timer);
    timer = null;
    clearUiTimers();
    releaseAudio?.();
    if (activePlayer === api) activePlayer = null;
    onPosition?.(position);
    emitState();
    onEnded?.();
  }

  function schedulerTick() {
    if (!playing) return;
    let now = audioNow();
    let pos = rawPosition(now);

    if (loopEnabled && loopEnd > loopStart && pos >= loopEnd) {
      performLoop(now);
      now = audioNow();
      pos = rawPosition(now);
    }

    const segmentEnd = loopEnabled && loopEnd > loopStart
      ? Math.min(loopEnd, pos + LOOKAHEAD_SECONDS * playbackRate)
      : Math.min(duration, pos + LOOKAHEAD_SECONDS * playbackRate);

    while (nextIndex < events.length) {
      const event = events[nextIndex];
      if (event.time > segmentEnd + 1e-6) break;

      // Skip stale events after seek/loop boundary changes.
      if (event.time >= pos - 0.012) {
        const when = Math.max(
          audioNow() + MIN_EVENT_LEAD_SECONDS,
          baseAudioTime + (event.time - basePosition) / playbackRate
        );
        const scheduledEvent = playbackRate === 1
          ? event
          : { ...event, duration: event.duration / playbackRate, sourceDuration: event.duration };
        scheduleAudio?.(scheduledEvent, when);
        scheduleUi(onEventStart, scheduledEvent, when);
        scheduleUi(onEventEnd, scheduledEvent, when + scheduledEvent.duration);
      }
      nextIndex++;
    }

    position = currentPosition(now);
    onPosition?.(position);

    if (!loopEnabled && duration > 0 && pos >= duration && nextIndex >= events.length) {
      finishNaturally();
    }
  }

  async function play(startAt = position) {
    if (!events.length || duration <= 0) return false;
    await ensureToneStarted();

    if (activePlayer && activePlayer !== api) activePlayer.stop({ reset: false, external: true });
    activePlayer = api;

    clearUiTimers();
    releaseAudio?.();
    playing = true;
    armFrom(startAt, START_LEAD_SECONDS);
    schedulerTick();
    timer = setInterval(schedulerTick, TICK_MS);
    emitState();
    return true;
  }

  function pause() {
    if (!playing) return;
    position = currentPosition();
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
    clearUiTimers();
    releaseAudio?.();
    if (activePlayer === api) activePlayer = null;
    onPosition?.(position);
    emitState();
  }

  function stop({ reset = true, external = false } = {}) {
    if (playing) position = currentPosition();
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
    clearUiTimers();
    releaseAudio?.();
    if (reset) position = 0;
    basePosition = position;
    baseAudioTime = audioNow();
    nextIndex = findEventIndex(events, position);
    if (activePlayer === api) activePlayer = null;
    onPosition?.(position);
    emitState();
    if (!external && reset) onEnded?.({ stopped: true });
  }

  function seek(nextPosition) {
    const target = clamp(Number(nextPosition) || 0, 0, Math.max(duration, 0));
    clearUiTimers();
    releaseAudio?.();
    if (playing) armFrom(target, MIN_EVENT_LEAD_SECONDS);
    else {
      position = target;
      basePosition = target;
      baseAudioTime = audioNow();
      nextIndex = findEventIndex(events, target);
    }
    onPosition?.(target);
    emitState();
  }

  function setEvents(nextEvents, nextDuration = null) {
    const wasPlaying = playing;
    if (wasPlaying) pause();
    events = normalizeEvents(nextEvents);
    const inferredDuration = events.reduce((max, event) => Math.max(max, event.time + event.duration), 0);
    duration = Math.max(0, Number(nextDuration) || inferredDuration);
    position = clamp(position, 0, duration);
    basePosition = position;
    nextIndex = findEventIndex(events, position);
    if (loopEnd > duration) loopEnd = duration;
    emitState();
  }


  function setPlaybackRate(nextRate) {
    const rate = clamp(Number(nextRate) || 1, 0.1, 8);
    if (Math.abs(rate - playbackRate) < 1e-6) return playbackRate;

    // Preserve the musical position while changing speed. Events already inside
    // the tiny look-ahead window finish at their previously scheduled time; all
    // subsequent events use the new rate without restarting playback.
    if (playing) {
      const now = audioNow();
      const pos = currentPosition(now);
      position = pos;
      basePosition = pos;
      baseAudioTime = now;
    }
    playbackRate = rate;
    emitState();
    return playbackRate;
  }

  function setLoop(enabled, start = loopStart, end = loopEnd) {
    loopEnabled = Boolean(enabled);
    loopStart = clamp(Number(start) || 0, 0, Math.max(duration, 0));
    loopEnd = clamp(Number(end) || duration, loopStart, Math.max(duration, loopStart));
    if (loopEnd - loopStart < 0.01) loopEnabled = false;
    if (playing && loopEnabled) {
      const pos = currentPosition();
      if (pos < loopStart || pos >= loopEnd) seek(loopStart);
    }
    emitState();
  }

  const api = {
    play,
    pause,
    stop,
    seek,
    setEvents,
    setLoop,
    setPlaybackRate,
    getPlaybackRate: () => playbackRate,
    getPosition: () => currentPosition(),
    isPlaying: () => playing,
    getDuration: () => duration,
    getLoop: () => ({ enabled: loopEnabled, start: loopStart, end: loopEnd })
  };

  players.add(api);
  return api;
}

export function stopAllTimelinePlayback() {
  players.forEach(player => player.stop({ reset: false, external: true }));
  activePlayer = null;
}
