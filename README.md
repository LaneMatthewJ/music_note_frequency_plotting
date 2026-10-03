# Frequency &amp; Beat Visualizer

Give it a list of frequencies (Hz) and it plots each tone individually, the
combined waveform, and the amplitude envelope that shows the resulting beat
pattern — with a play button so you can hear it too.

The interactive showcase lives at **src/index.md**, built with [Observable
Framework](https://observablehq.com/framework/) and D3. The actual math and
audio logic is a small, dependency-free module —
[`src/components/beatviz-core.js`](src/components/beatviz-core.js) — so it
can be lifted out and dropped into a blog post on its own (see below).

## Local development

```
npm install
npm run dev
```

Then visit <http://localhost:3000>.

```
npm run build   # static site -> dist/
npm test        # math sanity checks for beatviz-core.js (node --test)
```

## Deploying to GitHub Pages

A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds the site
and publishes `dist/` on every push to `main`. One-time setup: in the repo's
**Settings → Pages**, set **Source** to **GitHub Actions**.

## Embedding in a blog post

`beatviz-core.js` has no dependencies of its own (no D3, no Framework), so
any page can import it directly and pair it with D3 from a CDN:

```html
<div id="beatviz"></div>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script type="module">
  // Self-host this file, or point at your repo via jsDelivr's GitHub CDN,
  // e.g. https://cdn.jsdelivr.net/gh/<user>/<repo>@main/src/components/beatviz-core.js
  import { computeSignals, playTones, stopTones } from "./beatviz-core.js";

  const { t, combined, envelope } = computeSignals([440, 444], { duration: 0.1 });
  const width = 640, height = 200;
  const x = d3.scaleLinear().domain(d3.extent(t)).range([0, width]);
  const y = d3.scaleLinear().domain([-2.3, 2.3]).range([height, 0]);
  const line = d3.line().x((d, i) => x(t[i])).y((d) => y(d));

  const svg = d3.select("#beatviz").append("svg").attr("viewBox", [0, 0, width, height]);
  svg.append("path").datum(combined).attr("fill", "none").attr("stroke", "steelblue").attr("d", line);

  const playBtn = document.createElement("button");
  playBtn.textContent = "▶ Play";
  playBtn.onclick = () => playTones([440, 444]);
  document.getElementById("beatviz").append(playBtn);
</script>
```

## API

```js
import { computeSignals, playTones, stopTones } from "./beatviz-core.js";

computeSignals(frequencies, { duration = 0.1, sampleRate = 5000 } = {})
// -> { t, individual: [{ freq, y }], combined, envelope, beatPairs }

playTones(frequencies, { gain = 0.2, rampTime = 0.02 } = {}) // Web Audio playback
stopTones({ rampTime = 0.03 } = {})
```

- `frequencies`: a non-empty array of numbers, in Hz.
- `combined` is the literal sum of each tone's sine wave.
- `envelope` is the amplitude envelope of `combined` (rectify + centered
  moving-average smoothing over one period of the highest input frequency),
  which generalizes the classic 2-tone beat pattern to any number of tones.
- `beatPairs` lists every pairwise `|f_i - f_j|`.
