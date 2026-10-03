# Frequency &amp; Beat Visualizer

Enter a list of frequencies to see each tone plotted individually, their
combined waveform, and the resulting beat pattern — then hit play to hear it.

```js
import {computeSignals, playTones, stopTones} from "./components/beatviz-core.js";
import * as d3 from "npm:d3";
```

```js
const SAMPLE_RATE = 10000; // samples/sec used for plotting, independent of audio playback
```

```js
const freqText = view(
  Inputs.text({label: "Frequencies (Hz, comma-separated)", value: "440, 444", width: 320})
);
```

```js
const windowMs = view(
  Inputs.range([10, 1000], {label: "Time window (ms)", value: 100, step: 10})
);
```

```js
const frequencies = freqText
  .split(",")
  .map((s) => parseFloat(s.trim()))
  .filter((f) => Number.isFinite(f) && f > 0);
```

```js
const signals = frequencies.length ? computeSignals(frequencies, {duration: windowMs / 1000, sampleRate: SAMPLE_RATE}) : null;
```

```js
const playButton = html`<button>▶ Play</button>`;
const stopButton = html`<button>■ Stop</button>`;
playButton.onclick = () => frequencies.length && playTones(frequencies);
stopButton.onclick = () => stopTones();
const playStatus = frequencies.length
  ? `Playing all ${frequencies.length} ton${frequencies.length === 1 ? "e" : "es"} together — that mix is the beat.`
  : "Enter at least one valid frequency.";
```

<div class="card" style="display:flex; gap:0.75rem; align-items:center;">
  ${playButton}${stopButton}
  <span style="color:var(--theme-foreground-muted); font-size:0.85em;">${playStatus}</span>
</div>

## Individual tones

```js
signals ? individualChart(signals) : html`<p><em>Enter at least one valid frequency above.</em></p>`
```

## Combined waveform &amp; beat envelope

```js
signals ? combinedChart(signals) : ""
```

```js
signals && signals.beatPairs.length
  ? html`<p>${signals.beatPairs.map((p) => `${formatHz(p.f1)} & ${formatHz(p.f2)} → beat of ${formatHz(p.beat)}`).join(" · ")}</p>`
  : ""
```

---

```js
function formatHz(f) {
  return `${Number(f.toFixed(3))} Hz`;
}
```

```js
function chartFrame(width, height, margin) {
  const svg = d3
    .create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("height", height)
    .attr("style", "max-width: 100%; height: auto;");
  return svg;
}
```

```js
function timeAxis(svg, x, width, height, margin) {
  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `${(d * 1000).toFixed(0)} ms`));
}
```

```js
function individualChart(signals, {width = 688, height = 240} = {}) {
  const margin = {top: 12, right: 16, bottom: 28, left: 40};
  const x = d3.scaleLinear().domain(d3.extent(signals.t)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([-1.15, 1.15]).range([height - margin.bottom, margin.top]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(signals.individual.map((s) => s.freq));
  const line = d3.line().x((d, i) => x(signals.t[i])).y((d) => y(d));

  const svg = chartFrame(width, height, margin);
  timeAxis(svg, x, width, height, margin);
  svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5));

  for (const {freq, y: ys} of signals.individual) {
    svg
      .append("path")
      .datum(ys)
      .attr("fill", "none")
      .attr("stroke", color(freq))
      .attr("stroke-width", 1.5)
      .attr("d", line);
  }

  const legend = svg.append("g").attr("transform", `translate(${margin.left + 6}, ${margin.top})`);
  signals.individual.forEach((s, i) => {
    const row = legend.append("g").attr("transform", `translate(0, ${i * 15})`);
    row.append("rect").attr("width", 9).attr("height", 9).attr("fill", color(s.freq));
    row.append("text").attr("x", 13).attr("y", 8).attr("font-size", 10).text(formatHz(s.freq));
  });

  return svg.node();
}
```

```js
function combinedChart(signals, {width = 688, height = 280} = {}) {
  const margin = {top: 12, right: 16, bottom: 28, left: 40};
  const extent = d3.max(signals.envelope) || 1;
  const x = d3.scaleLinear().domain(d3.extent(signals.t)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([-extent * 1.15, extent * 1.15]).range([height - margin.bottom, margin.top]);
  const line = d3.line().x((d, i) => x(signals.t[i])).y((d) => y(d));

  const svg = chartFrame(width, height, margin);
  timeAxis(svg, x, width, height, margin);
  svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5));

  svg
    .append("path")
    .datum(signals.envelope)
    .attr("fill", "none")
    .attr("stroke", "currentColor")
    .attr("stroke-dasharray", "4,3")
    .attr("stroke-opacity", 0.5)
    .attr("d", line);

  svg
    .append("path")
    .datum(Array.from(signals.envelope, (v) => -v))
    .attr("fill", "none")
    .attr("stroke", "currentColor")
    .attr("stroke-dasharray", "4,3")
    .attr("stroke-opacity", 0.5)
    .attr("d", line);

  svg
    .append("path")
    .datum(signals.combined)
    .attr("fill", "none")
    .attr("stroke", "var(--theme-foreground-focus)")
    .attr("stroke-width", 1.5)
    .attr("d", line);

  return svg.node();
}
```
