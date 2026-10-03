import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSignals } from "../src/components/beatviz-core.js";

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
