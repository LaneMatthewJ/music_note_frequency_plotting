// Dependency-free core: waveform math + Web Audio playback for a list of
// frequencies (Hz). No D3, no Observable Framework imports, so this file
// can be lifted out and used as-is in a plain <script type="module"> on any
// other page (e.g. a blog post) — see README.md for that snippet.

/**
 * Compute the individual sine waves for each input frequency, their sum,
 * and the sum's amplitude envelope.
 *
 * @param {number[]} frequencies - list of frequencies in Hz (non-empty)
 * @param {{duration?: number, sampleRate?: number}} [options]
 *   duration: time window to sample, in seconds (default 0.1s)
 *   sampleRate: samples per second (default 5000)
 */
export function computeSignals(frequencies, { duration = 0.1, sampleRate = 5000 } = {}) {
  if (!Array.isArray(frequencies) || frequencies.length === 0) {
    throw new Error("frequencies must be a non-empty array of numbers (Hz)");
  }

  const n = Math.max(2, Math.round(duration * sampleRate));
  const dt = duration / (n - 1);
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = i * dt;

  const individual = frequencies.map((freq) => {
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = Math.sin(2 * Math.PI * freq * t[i]);
    return { freq, y };
  });

  const combined = new Float64Array(n);
  for (const { y } of individual) {
    for (let i = 0; i < n; i++) combined[i] += y[i];
  }

  const envelope = computeEnvelope(combined, dt, Math.max(...frequencies));

  const beatPairs = [];
  for (let i = 0; i < frequencies.length; i++) {
    for (let j = i + 1; j < frequencies.length; j++) {
      beatPairs.push({
        f1: frequencies[i],
        f2: frequencies[j],
        beat: Math.abs(frequencies[i] - frequencies[j])
      });
    }
  }

  return { t, individual, combined, envelope, beatPairs };
}

// Amplitude envelope of `signal`: rectify (abs) then smooth with a centered
// moving average spanning one full period of the fastest input tone. That
// window length cancels the fastest tone's ripple (and its harmonics) while
// preserving slower beat-rate modulation, for any number of input
// frequencies — no FFT/Hilbert transform required.
function computeEnvelope(signal, dt, maxFreq) {
  const n = signal.length;
  const period = 1 / maxFreq;
  const halfWindow = Math.max(1, Math.round(period / dt / 2));

  // Prefix sums of the rectified signal give an O(n) sliding-window average.
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + Math.abs(signal[i]);

  const envelope = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - halfWindow);
    const hi = Math.min(n - 1, i + halfWindow);
    envelope[i] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
  }
  return envelope;
}

/**
 * The time to complete one full cycle of the chord's slowest beat — i.e.
 * the shortest time window that shows one full repeat of the overall
 * pattern. For two or more tones this is 1 / (smallest pairwise frequency
 * difference): the beat note's own period bounds how long every faster
 * beat also takes to realign, since each faster beat's period divides it.
 * (Exact only when the input frequencies are exact rational multiples of
 * each other, e.g. just intonation — equal-tempered frequencies are
 * irrational multiples of one another, so this is the closest well-defined
 * single-cycle window.) A single tone just returns its own period.
 */
export function fundamentalPeriodMs(frequencies) {
  if (!Array.isArray(frequencies) || frequencies.length === 0) {
    throw new Error("frequencies must be a non-empty array of numbers (Hz)");
  }

  let minDiff = Infinity;
  for (let i = 0; i < frequencies.length; i++) {
    for (let j = i + 1; j < frequencies.length; j++) {
      const diff = Math.abs(frequencies[i] - frequencies[j]);
      if (diff > 0 && diff < minDiff) minDiff = diff;
    }
  }

  const beatFreq = Number.isFinite(minDiff) ? minDiff : Math.min(...frequencies);
  return 1000 / beatFreq;
}

// --- Note / MIDI / Hz conversion ---------------------------------------

/** Standard MIDI note number to Hz, 12-tone equal temperament, A4 (69) = 440. */
export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const NOTE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_NAME_RE = /^([A-Ga-g])([#♯bB♭]?)(-?\d+)$/;

/**
 * Scientific pitch notation (e.g. "C4", "F#3", "Bb5") to a MIDI note number.
 * Octave convention: C4 = MIDI 60, so A4 = MIDI 69 = 440 Hz. One optional
 * accidental only (no double sharps/flats).
 */
export function noteNameToMidi(name) {
  const match = NOTE_NAME_RE.exec(String(name).trim());
  if (!match) {
    throw new Error(`invalid note name "${name}" — expected e.g. "C4", "F#3", "Bb5"`);
  }
  const [, letter, accidental, octaveStr] = match;
  let semitone = NOTE_SEMITONES[letter.toUpperCase()];
  if (accidental === "#" || accidental === "♯") semitone += 1;
  else if (accidental === "b" || accidental === "B" || accidental === "♭") semitone -= 1;
  return (parseInt(octaveStr, 10) + 1) * 12 + semitone;
}

const SEMITONE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * MIDI note number to scientific pitch notation, e.g. 60 -> "C4", 69 -> "A4".
 * Inverse of noteNameToMidi. Always spells with sharps (never flats).
 */
export function midiToNoteName(midi) {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  const semitone = ((rounded % 12) + 12) % 12;
  return `${SEMITONE_NAMES[semitone]}${octave}`;
}

// Semitone offsets from the root for common chord/interval presets.
export const CHORD_INTERVALS = {
  major: [0, 4, 7], // e.g. C-E-G
  minor: [0, 3, 7], // e.g. C-Eb-G
  diminished: [0, 3, 6], // e.g. C-Eb-Gb
  tritone: [0, 6] // e.g. C-F#
};

/** MIDI note numbers for a named chord/interval preset built on `rootMidi`. */
export function chordMidiNotes(rootMidi, chordType) {
  const intervals = CHORD_INTERVALS[chordType];
  if (!intervals) throw new Error(`unknown chord type "${chordType}"`);
  return intervals.map((semitones) => rootMidi + semitones);
}

/**
 * Converts one user-entered value to Hz, given its input mode.
 * @param {string|number} raw
 * @param {"hz"|"midi"|"note"} type
 */
export function noteToHz(raw, type) {
  const value = String(raw).trim();
  if (value === "") throw new Error("value is empty");

  if (type === "hz") {
    const hz = Number(value);
    if (!Number.isFinite(hz) || hz <= 0) throw new Error(`"${raw}" is not a positive number of Hz`);
    return hz;
  }
  if (type === "midi") {
    const midi = Number(value);
    if (!Number.isFinite(midi)) throw new Error(`"${raw}" is not a MIDI note number, e.g. 69`);
    return midiToHz(midi);
  }
  if (type === "note") {
    return midiToHz(noteNameToMidi(value));
  }
  throw new Error(`unknown input type "${type}"`);
}

// --- Web Audio playback -----------------------------------------------

let audioCtx = null;
let activeVoices = [];

/** Play all given frequencies (Hz) simultaneously so any beat is audible. */
export function playTones(frequencies, { gain = 0.2, rampTime = 0.02 } = {}) {
  stopTones();
  audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();

  const now = audioCtx.currentTime;
  const perToneGain = gain / frequencies.length;
  activeVoices = frequencies.map((freq) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(perToneGain, now + rampTime); // avoid click
    osc.connect(g).connect(audioCtx.destination);
    osc.start(now);
    return { osc, gain: g };
  });
}

/** Stop any tones started by playTones. Safe to call if nothing is playing. */
export function stopTones({ rampTime = 0.03 } = {}) {
  if (!activeVoices.length) return;
  const now = audioCtx.currentTime;
  for (const { osc, gain } of activeVoices) {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + rampTime);
    osc.stop(now + rampTime + 0.01);
  }
  activeVoices = [];
}
