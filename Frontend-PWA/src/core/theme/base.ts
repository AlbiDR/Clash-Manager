/**
 * CLASH MANAGER - Base Reset & Gestures
 * Ported to TypeScript for Technical Purity.
 */
export const baseStyles = `
/* =========================================
   MINIMAL RESET
   ========================================= */
*, ::before, ::after {
  box-sizing: border-box;
  border-width: 0;
  border-style: solid;
  border-color: var(--sys-color-outline-variant, #e0e0e0);
}

html {
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
  tab-size: 4;
  font-family: system-ui, sans-serif;
  scrollbar-gutter: stable;
}

body {
  margin: 0;
  line-height: inherit;
}

hr { height: 0; color: inherit; border-top-width: 1px; }

h1, h2, h3, h4, h5, h6 { font-size: inherit; font-weight: inherit; }

a { color: inherit; text-decoration: inherit; }

b, strong { font-weight: bolder; }

code, kbd, samp, pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 1em;
}

small { font-size: 80%; }

sub, sup {
  font-size: 75%;
  line-height: 0;
  position: relative;
  vertical-align: baseline;
}

sub { bottom: -0.25em; }
sup { top: -0.5em; }

table { text-indent: 0; border-color: inherit; border-collapse: collapse; }

button, input, optgroup, select, textarea {
  font-family: inherit;
  font-size: 100%;
  line-height: inherit;
  color: inherit;
  margin: 0;
  padding: 0;
}

button, select { text-transform: none; }

button, [type='button'], [type='reset'], [type='submit'] {
  -webkit-appearance: button;
  background-color: transparent;
  background-image: none;
}

:-moz-focusring { outline: auto; }
:-moz-ui-invalid { box-shadow: none; }
progress { vertical-align: baseline; }

::-webkit-inner-spin-button, ::-webkit-outer-spin-button { height: auto; }

[type='search'] { -webkit-appearance: textfield; outline-offset: -2px; }

::-webkit-search-decoration { -webkit-appearance: none; }

::-webkit-file-upload-button { -webkit-appearance: button; font: inherit; }

summary { display: list-item; }

blockquote, dl, dd, h1, h2, h3, h4, h5, h6, hr, figure, p, pre { margin: 0; }

fieldset { margin: 0; padding: 0; }

legend { padding: 0; }

ol, ul, menu { list-style: none; margin: 0; padding: 0; }

img, svg, video, canvas, audio, iframe, embed, object {
  display: block;
  vertical-align: middle;
}

img, video { max-width: 100%; height: auto; }

/* =========================================
   LOCAL FONTS
   ========================================= */
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/Inter-Variable.woff2") format("woff2");
}

@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/JetBrainsMono-Bold.woff2") format("woff2");
}

/* =========================================
   NATIVE APP GESTURES
   ========================================= */
body {
  overscroll-behavior-y: contain;
  overscroll-behavior-x: none;
  touch-action: pan-y;
}

* {
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
}

input, textarea, [contenteditable], .selectable {
  -webkit-user-select: text;
  -moz-user-select: text;
  user-select: text;
}

* { -webkit-touch-callout: none; }

* {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.view-container, .scrollable-area, .list-container {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: auto;
  will-change: scroll-position;
}
`;
