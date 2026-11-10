# Frequency &amp; Beat Visualizer

Add notes below — as a note name, MIDI number, or Hz — to see each tone
plotted individually, their combined waveform, and the resulting beat
pattern, then hit play to hear it.

```js
import {computeSignals, playTones, stopTones, fundamentalPeriodMs, noteToHz, noteNameToMidi, chordMidiNotes, midiToNoteName} from "./components/beatviz-core.js";
import * as d3 from "npm:d3";
```

```js
const SAMPLE_RATE = 10000; // samples/sec used for plotting, independent of audio playback
const WINDOW_MS_MIN = 10;
const WINDOW_MS_MAX = 10000; // safety ceiling, not a UX choice: duration*SAMPLE_RATE samples get drawn per redraw
```

```js
// Manual light/dark override. Framework's own theme CSS picks air (light) or
// near-midnight (dark) purely via (prefers-color-scheme); observablehq.config.js
// mirrors that same palette under a [data-theme] attribute (higher specificity,
// so it wins regardless of OS setting) whenever this button sets it.
const themeButton = html`<button style="position:fixed; top:12px; right:12px; z-index:10;"></button>`;
function effectiveTheme() {
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark"
    ? stored
    : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme; // explicit override: wins regardless of OS setting
  localStorage.setItem("theme", theme);
  themeButton.textContent = theme === "dark" ? "☀️ Light mode" : "🌙 Dark mode";
}
// On load: restore a previously *chosen* override, if any. Otherwise leave
// data-theme unset entirely (don't call applyTheme — it would pin today's OS
// preference into localStorage forever, which would then stop the page from
// following future OS changes even though the user never touched the toggle)
// and just label the button to match what's currently showing.
const storedTheme = localStorage.getItem("theme");
if (storedTheme === "light" || storedTheme === "dark") {
  applyTheme(storedTheme);
} else {
  themeButton.textContent = effectiveTheme() === "dark" ? "☀️ Light mode" : "🌙 Dark mode";
}
themeButton.onclick = () => applyTheme(effectiveTheme() === "dark" ? "light" : "dark");
```

${themeButton}

## Notes

```js
// One-time setup: the row container and its element map persist across
// reactive re-renders below (plain object mutation, not reassignment), so
// adding/removing one row never recreates another row's DOM node — which
// would otherwise reset whatever the user had already typed into it, and
// could steal focus away mid-keystroke.
const rowsContainer = html`<div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:0.5rem;"></div>`;
const rowElements = new Map(); // row id -> {wrapper, select, input}
let nextRowId = 1;
function makeRow(type, initialValue = "") {
  return {id: nextRowId++, type, initialValue};
}
```

```js
const rowsMutable = Mutable([makeRow("hz", "440"), makeRow("hz", "444")]);
function addRow(type = "hz") {
  rowsMutable.value = [...rowsMutable.value, makeRow(type)];
}
function removeRow(id) {
  if (rowsMutable.value.length <= 1) return; // keep at least one row
  rowsMutable.value = rowsMutable.value.filter((r) => r.id !== id);
}
function setRowType(id, type) {
  rowsMutable.value = rowsMutable.value.map((r) => (r.id === id ? {...r, type} : r));
}
function replaceRows(entries) {
  // entries: [{type, value}, ...] — used by the chord-preset buttons below
  rowsMutable.value = entries.map(({type, value}) => makeRow(type, String(value)));
}
```

```js
// Bumped on every keystroke in any row. Only the parsing cell below depends
// on this — the row-rendering cell depends on `rows` instead, so typing
// never rebuilds the row list (which would drop keyboard focus). The bump
// function is defined here (not inline where it's used) because a Mutable's
// `.value` setter is only reachable from within its own defining cell —
// other cells see the already-unwrapped current value, same as `view()`.
const liveTickMutable = Mutable(0);
function bumpLiveTick() {
  liveTickMutable.value += 1;
}
```

```js
// Quick-start chord presets: build each from the chosen root (always via
// octave 4, e.g. root "D" -> D4) using chordMidiNotes, convert each note
// back to its name (midiToNoteName), and replace the current rows with
// note-typed rows — reads as "D4, F#4, A4" rather than raw MIDI numbers.
const rootSelect = html`<select>
  ${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].map((n) => html`<option value=${n}>${n}</option>`)}
</select>`;
function applyChordPreset(chordType) {
  const rootMidi = noteNameToMidi(`${rootSelect.value}4`);
  const notes = chordMidiNotes(rootMidi, chordType).map(midiToNoteName);
  replaceRows(notes.map((note) => ({type: "note", value: note})));
}
const presetButtons = ["major", "minor", "diminished", "tritone"].map((chordType) => {
  const button = html`<button>${chordType[0].toUpperCase()}${chordType.slice(1)}</button>`;
  button.onclick = () => applyChordPreset(chordType);
  return button;
});
```

<div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-bottom:0.5rem;">
  <span style="color:var(--theme-foreground-muted); font-size:0.85em;">Quick chord on root</span>
  ${rootSelect}
  ${presetButtons}
</div>

```js
const addButton = html`<button>+ Add note</button>`;
addButton.onclick = () => addRow("hz");
```

```js
const rows = rowsMutable; // already the current array (Mutable auto-unwraps across cells)
```

```js
// Reconcile rowsContainer's children against `rows`: reuse existing row
// elements for ids already present, append new ones, remove deleted ones.
const seenRowIds = new Set();
for (const row of rows) {
  seenRowIds.add(row.id);
  let entry = rowElements.get(row.id);
  if (!entry) {
    entry = buildRowElement(row, {setType: setRowType, remove: removeRow, onInput: bumpLiveTick});
    rowElements.set(row.id, entry);
    rowsContainer.appendChild(entry.wrapper);
  } else if (entry.select.value !== row.type) {
    entry.select.value = row.type;
    entry.input.placeholder = placeholderForType(row.type);
  }
}
for (const [id, entry] of [...rowElements]) {
  if (!seenRowIds.has(id)) {
    entry.wrapper.remove();
    rowElements.delete(id);
  }
}
// Exported so the parsing cell below depends on this cell's *completion*,
// not just on `rows` too — both cells react to `rows`, and Framework doesn't
// guarantee sibling cells with the same dependency run in file order, so
// without this edge the parser could run before rowElements is reconciled.
const reconciledRows = rows;
```

<div>
  ${addButton}
  ${rowsContainer}
</div>

```js
liveTickMutable; // reference it so this cell depends on every keystroke, not just add/remove/type-change
const frequencies = [];
const parseErrors = [];
for (const row of reconciledRows) {
  const entry = rowElements.get(row.id);
  const raw = entry.input.value.trim();
  if (!raw) continue;
  try {
    frequencies.push(noteToHz(raw, entry.select.value));
  } catch (err) {
    parseErrors.push(`"${raw}" (${entry.select.value}): ${err.message}`);
  }
}
const parseErrorNote = parseErrors.length ? parseErrors.join(" · ") : "";
```

<div style="margin: 0 0 1rem;">
  <span style="color:#d1555a; font-size:0.85em;">${parseErrorNote}</span>
</div>

```js
const windowInput = Inputs.range([WINDOW_MS_MIN, WINDOW_MS_MAX], {label: "X axis: time window (ms)", value: 100, step: 10});
const windowMs = view(windowInput);
```

```js
const yAuto = view(Inputs.toggle({label: "Auto-scale Y axis", value: true}));
```

```js
const yRangeInput = Inputs.number([0, undefined], {label: "Y axis: amplitude range (±)", value: 2, disabled: yAuto});
const yRange = view(yRangeInput);
```

```js
const periodButton = html`<button>⟲ View beat cycle</button>`;
periodButton.disabled = frequencies.length === 0;
periodButton.onclick = () => {
  if (!frequencies.length) return;
  windowInput.value = Math.round(Math.min(WINDOW_MS_MAX, Math.max(WINDOW_MS_MIN, fundamentalPeriodMs(frequencies))));
  windowInput.dispatchEvent(new Event("input", {bubbles: true}));
};
const periodNote = frequencies.length
  ? (fundamentalPeriodMs(frequencies) > WINDOW_MS_MAX
      ? `Beat cycle is ${Math.round(fundamentalPeriodMs(frequencies)).toLocaleString()} ms — capped at the ${WINDOW_MS_MAX} ms slider max.`
      : `Shows one full cycle of the slowest beat (${Math.round(fundamentalPeriodMs(frequencies)).toLocaleString()} ms). In equal temperament the chord itself never exactly repeats.`)
  : "";
```

<div style="display:flex; gap:0.75rem; align-items:center; margin: 0.5rem 0 1rem;">
  ${periodButton}
  <span style="color:var(--theme-foreground-muted); font-size:0.85em;">${periodNote}</span>
</div>

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
signals ? chartCard(individualChart(signals, {yAuto, yRange}), "individual-tones.png") : html`<p><em>Enter at least one valid frequency above.</em></p>`
```

## Combined waveform &amp; beat envelope

```js
const showWaveform = view(Inputs.toggle({label: "Combined waveform", value: true}));
const showEnvelope = view(Inputs.toggle({label: "Beat envelope", value: true}));
```

```js
signals ? chartCard(combinedChart(signals, {showWaveform, showEnvelope, yAuto, yRange}), "combined-waveform.png") : ""
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
function placeholderForType(type) {
  return type === "note" ? "e.g. D3" : type === "midi" ? "e.g. 69" : "e.g. 293.66";
}
```

```js
// Builds one note-input row: a type selector, a value field, and a remove
// button. `callbacks` wires row actions back to the mutators defined above
// without this function needing to know about Mutable/reactivity at all.
function buildRowElement(row, callbacks) {
  const select = html`<select>
    <option value="hz">Hz</option>
    <option value="note">Note</option>
    <option value="midi">MIDI</option>
  </select>`;
  select.value = row.type;
  select.onchange = () => callbacks.setType(row.id, select.value);

  const input = html`<input type="text" style="width:9em;" placeholder=${placeholderForType(row.type)} value=${row.initialValue}>`;
  input.oninput = callbacks.onInput;

  const removeButton = html`<button type="button" title="Remove this note" style="line-height:1;">×</button>`;
  removeButton.onclick = () => callbacks.remove(row.id);

  const wrapper = html`<div style="display:flex; gap:0.5rem; align-items:center;">${select}${input}${removeButton}</div>`;
  return {wrapper, select, input, removeButton};
}
```

```js
// Wraps a rendered chart <svg> with a "Save PNG" button (plus an "include
// axes" checkbox controlling only the exported image) beneath it.
function chartCard(svgNode, filename) {
  const axesLabel = html`<label style="display:inline-flex; align-items:center; gap:0.35rem; font-size:0.85em; color:var(--theme-foreground-muted);"><input type="checkbox" checked /> Include axes</label>`;
  const axesCheckbox = axesLabel.querySelector("input");
  const button = html`<button>⬇ Save PNG</button>`;
  button.onclick = () => downloadNodeAsPng(svgNode, filename, {includeAxes: axesCheckbox.checked});
  return html`<div>${svgNode}<div style="display:flex; gap:0.75rem; align-items:center; margin-top:0.5rem;">${button}${axesLabel}</div></div>`;
}
```

```js
// Rasterizes an SVG chart to a PNG and triggers a browser download. Snapshots
// each element's computed fill/stroke onto a clone first, since currentColor
// and var(--theme-*) only resolve against the live, attached DOM — an <img>
// loaded from a detached SVG blob can't see the page's theme.
function downloadNodeAsPng(svgNode, filename, {scale = 2, background = "white", includeAxes = true} = {}) {
  const clone = svgNode.cloneNode(true);
  const liveEls = [svgNode, ...svgNode.querySelectorAll("*")];
  const cloneEls = [clone, ...clone.querySelectorAll("*")];
  liveEls.forEach((liveEl, i) => {
    const computed = getComputedStyle(liveEl);
    cloneEls[i].setAttribute("fill", computed.fill);
    cloneEls[i].setAttribute("stroke", computed.stroke);
  });
  if (!includeAxes) {
    clone.querySelectorAll(".chart-axis").forEach((el) => el.remove());
  }
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const width = Number(svgNode.getAttribute("width"));
  const height = Number(svgNode.getAttribute("height"));
  const svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], {type: "image/svg+xml;charset=utf-8"}));

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(svgUrl);
    canvas.toBlob((blob) => {
      const pngUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(pngUrl);
    }, "image/png");
  };
  img.src = svgUrl;
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
    .attr("class", "chart-axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `${(d * 1000).toFixed(0)} ms`));
}
```

```js
function individualChart(signals, {width = 688, height = 240, yAuto = true, yRange} = {}) {
  const margin = {top: 12, right: 16, bottom: 28, left: 40};
  const halfRange = !yAuto && yRange > 0 ? yRange : 1.15; // unit-amplitude tones -> 1.15 auto headroom
  const x = d3.scaleLinear().domain(d3.extent(signals.t)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([-halfRange, halfRange]).range([height - margin.bottom, margin.top]);
  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(signals.individual.map((s) => s.freq));
  const line = d3.line().x((d, i) => x(signals.t[i])).y((d) => y(d));

  const svg = chartFrame(width, height, margin);
  timeAxis(svg, x, width, height, margin);
  svg.append("g").attr("class", "chart-axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5));

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
function combinedChart(signals, {width = 688, height = 280, showWaveform = true, showEnvelope = true, yAuto = true, yRange} = {}) {
  const margin = {top: 12, right: 16, bottom: 28, left: 40};
  let halfRange;
  if (!yAuto && yRange > 0) {
    halfRange = yRange; // manual: may clip the waveform if set smaller than its peak, by design
  } else {
    // Auto: sized from the combined signal's actual peak, not the envelope —
    // the envelope is a smoothed average, so the raw waveform can momentarily
    // swing higher than it; using the envelope here would clip those peaks.
    const peak = d3.max(signals.combined, (d) => Math.abs(d)) || 1;
    halfRange = Math.max(peak, d3.max(signals.envelope) || 0) * 1.15;
  }
  const x = d3.scaleLinear().domain(d3.extent(signals.t)).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([-halfRange, halfRange]).range([height - margin.bottom, margin.top]);
  const line = d3.line().x((d, i) => x(signals.t[i])).y((d) => y(d));

  const svg = chartFrame(width, height, margin);
  timeAxis(svg, x, width, height, margin);
  svg.append("g").attr("class", "chart-axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5));

  if (showEnvelope) {
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
  }

  if (showWaveform) {
    svg
      .append("path")
      .datum(signals.combined)
      .attr("fill", "none")
      .attr("stroke", "var(--theme-foreground-focus)")
      .attr("stroke-width", 1.5)
      .attr("d", line);
  }

  if (!showWaveform && !showEnvelope) {
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--theme-foreground-muted)")
      .attr("font-size", 12)
      .text("Nothing to show — enable the waveform or envelope above.");
  }

  return svg.node();
}
```
