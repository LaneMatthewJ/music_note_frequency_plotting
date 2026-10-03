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
