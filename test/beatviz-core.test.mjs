import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSignals, fundamentalPeriodMs, midiToHz, noteNameToMidi, noteToHz, chordMidiNotes, midiToNoteName } from "../src/components/beatviz-core.js";

test("rejects an empty frequency list", () => {
  assert.throws(() => computeSignals([]));
});

test("single tone matches a plain sine wave and is its own sum", () => {
  const { t, individual, combined } = computeSignals([10], { duration: 1, sampleRate: 100 });
  for (let i = 0; i < t.length; i++) {
    assert.ok(Math.abs(individual[0].y[i] - Math.sin(2 * Math.PI * 10 * t[i])) < 1e-9);
    assert.equal(combined[i], individual[0].y[i]);
  }
});

test("two equal frequencies sum to double amplitude at every sample", () => {
  const { individual, combined } = computeSignals([100, 100], { duration: 0.05, sampleRate: 2000 });
  for (let i = 0; i < combined.length; i++) {
    assert.ok(Math.abs(combined[i] - 2 * individual[0].y[i]) < 1e-9);
  }
});

test("beatPairs lists every pairwise |f_i - f_j|", () => {
  const { beatPairs } = computeSignals([440, 444, 450], { duration: 0.01 });
  assert.deepEqual(
    beatPairs.map((p) => p.beat).sort((a, b) => a - b),
    [4, 6, 10]
  );
});

test("envelope is finite and bounded by the number of tones", () => {
  const frequencies = [440, 444];
  const { envelope } = computeSignals(frequencies, { duration: 0.5, sampleRate: 5000 });
  for (const v of envelope) {
    assert.ok(Number.isFinite(v));
    assert.ok(v >= 0 && v <= frequencies.length + 1e-9);
  }
});

test("fundamentalPeriodMs rejects an empty frequency list", () => {
  assert.throws(() => fundamentalPeriodMs([]));
});

test("fundamentalPeriodMs of a single tone is its own period", () => {
  assert.ok(Math.abs(fundamentalPeriodMs([440]) - 1000 / 440) < 1e-9);
});

test("fundamentalPeriodMs is 1000 / smallest pairwise difference", () => {
  // smallest difference among 440/444/450 is |444-440| = 4 Hz -> 250 ms
  assert.ok(Math.abs(fundamentalPeriodMs([440, 444, 450]) - 250) < 1e-9);
});

test("fundamentalPeriodMs falls back to the tone's own period when all frequencies are equal", () => {
  assert.ok(Math.abs(fundamentalPeriodMs([440, 440]) - 1000 / 440) < 1e-9);
});

test("midiToHz: A4 (69) is 440 Hz exactly", () => {
  assert.equal(midiToHz(69), 440);
});

test("midiToHz: one octave up doubles the frequency", () => {
  assert.ok(Math.abs(midiToHz(81) - 880) < 1e-9);
});

test("noteNameToMidi: A4 is MIDI 69, C4 is MIDI 60", () => {
  assert.equal(noteNameToMidi("A4"), 69);
  assert.equal(noteNameToMidi("C4"), 60);
});

test("noteNameToMidi: sharps/flats and lowercase letters", () => {
  assert.equal(noteNameToMidi("F#3"), noteNameToMidi("Gb3"));
  assert.equal(noteNameToMidi("a4"), 69);
  assert.equal(noteNameToMidi("Bb4"), noteNameToMidi("A#4"));
});

test("noteNameToMidi: negative octaves and rejects garbage", () => {
  assert.equal(noteNameToMidi("C-1"), 0); // MIDI 0
  assert.throws(() => noteNameToMidi("H4"));
  assert.throws(() => noteNameToMidi("C##4"));
  assert.throws(() => noteNameToMidi(""));
});

test("noteToHz dispatches correctly per type", () => {
  assert.equal(noteToHz("440", "hz"), 440);
  assert.equal(noteToHz("69", "midi"), 440);
  assert.equal(noteToHz("A4", "note"), 440);
  assert.ok(Math.abs(noteToHz("C4", "note") - 261.6255653) < 1e-6);
});

test("noteToHz rejects invalid values per type", () => {
  assert.throws(() => noteToHz("", "hz"));
  assert.throws(() => noteToHz("-5", "hz"));
  assert.throws(() => noteToHz("not a number", "midi"));
  assert.throws(() => noteToHz("H9", "note"));
  assert.throws(() => noteToHz("440", "bogus-type"));
});

test("chordMidiNotes: C4 (MIDI 60) major/minor/diminished/tritone", () => {
  const c4 = noteNameToMidi("C4");
  assert.deepEqual(chordMidiNotes(c4, "major"), [60, 64, 67]); // C-E-G
  assert.deepEqual(chordMidiNotes(c4, "minor"), [60, 63, 67]); // C-Eb-G
  assert.deepEqual(chordMidiNotes(c4, "diminished"), [60, 63, 66]); // C-Eb-Gb
  assert.deepEqual(chordMidiNotes(c4, "tritone"), [60, 66]); // C-F#
});

test("chordMidiNotes rejects an unknown chord type", () => {
  assert.throws(() => chordMidiNotes(60, "augmented"));
});

test("midiToNoteName: C4 is 60, A4 is 69", () => {
  assert.equal(midiToNoteName(60), "C4");
  assert.equal(midiToNoteName(69), "A4");
});

test("midiToNoteName round-trips through noteNameToMidi", () => {
  for (const name of ["C4", "F#3", "A4", "C-1", "G9"]) {
    assert.equal(midiToNoteName(noteNameToMidi(name)), name);
  }
});

test("midiToNoteName always spells with sharps", () => {
  assert.equal(midiToNoteName(noteNameToMidi("Bb4")), "A#4");
});
