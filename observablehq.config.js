// See https://observablehq.com/framework/config for documentation.
//
// The theme-toggle override below reproduces the site's default theme pair
// (air / near-midnight) under a [data-theme] attribute instead of Framework's
// own (prefers-color-scheme) media-query imports, so a manual toggle can win
// regardless of OS setting. An attribute selector on :root has higher CSS
// specificity than the plain :root the media-query imports use, so these
// rules apply whenever data-theme is set, with no !important needed — and
// when it's absent, the page still follows the OS as it always has.
const THEME_OVERRIDE_CSS = `
<style>
:root[data-theme="light"] {
  color-scheme: light;
  --theme-foreground: #1b1e23;
  --theme-foreground-focus: #3b5fc0;
  --theme-background-a: #ffffff;
  --theme-background-b: color-mix(in srgb, var(--theme-foreground) 4%, var(--theme-background-a));
  --theme-background: var(--theme-background-a);
  --theme-background-alt: var(--theme-background-b);
  --theme-foreground-alt: color-mix(in srgb, var(--theme-foreground) 90%, var(--theme-background-a));
  --theme-foreground-muted: color-mix(in srgb, var(--theme-foreground) 60%, var(--theme-background-a));
  --theme-foreground-faint: color-mix(in srgb, var(--theme-foreground) 50%, var(--theme-background-a));
  --theme-foreground-fainter: color-mix(in srgb, var(--theme-foreground) 30%, var(--theme-background-a));
  --theme-foreground-faintest: color-mix(in srgb, var(--theme-foreground) 14%, var(--theme-background-a));
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --theme-foreground: #dfdfd6;
  --theme-foreground-focus: oklch(0.712564 0.257662 265.758);
  --theme-background-b: #161616;
  --theme-background-a: color-mix(in srgb, var(--theme-foreground) 4%, var(--theme-background-b));
  --theme-background: var(--theme-background-a);
  --theme-background-alt: var(--theme-background-b);
  --theme-foreground-alt: color-mix(in srgb, var(--theme-foreground) 90%, var(--theme-background-b));
  --theme-foreground-muted: color-mix(in srgb, var(--theme-foreground) 60%, var(--theme-background-b));
  --theme-foreground-faint: color-mix(in srgb, var(--theme-foreground) 50%, var(--theme-background-b));
  --theme-foreground-fainter: color-mix(in srgb, var(--theme-foreground) 30%, var(--theme-background-b));
  --theme-foreground-faintest: color-mix(in srgb, var(--theme-foreground) 14%, var(--theme-background-b));
}
</style>
`.trim();

const LAYOUT_CSS = `
<style>
#observablehq-main {
  text-align: center;
}
</style>
`.trim();

export default {
  title: "Frequency & Beat Visualizer",
  root: "src",
  sidebar: false,
  toc: false,
  pager: false,
  footer: "Built with Observable Framework + D3.",
  head: THEME_OVERRIDE_CSS + "\n" + LAYOUT_CSS
};
