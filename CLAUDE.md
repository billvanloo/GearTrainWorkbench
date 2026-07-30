# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A single-file, dependency-free gear train simulator for engineering education.
`index.html` (~1400 lines) is the entire shipped application. It must keep
working when downloaded and opened offline on a school Chromebook with no
network — so **never add a CDN link, package manager, build step, or external
asset.** Anything new gets inlined.

## The solver is duplicated — keep both copies in sync

The physics solver exists twice, on purpose:

- `dev/solver.js` — the source of truth, a pure CommonJS module, testable in Node.
- An inlined copy in `index.html` starting at `const MODULE = 4.5;`.

Editing order is not optional:

1. Edit `dev/solver.js` first.
2. `node dev/test.js` — 29 unit tests.
3. Copy the change into the inline block in `index.html`.
4. `node dev/verify-html.js` — 14 checks; this is what proves the two copies agree.

Both scripts must pass before a change is done. `verify-html.js` re-executes the
inline solver and re-runs the core math against it, so a desync fails loudly
rather than silently shipping two different physics engines.

### Don't break the extraction markers

`verify-html.js` slices the inline solver out of `index.html` by literal string
search: from `const MODULE = 4.5;` to the `CHALLENGE DEFINITIONS` banner comment,
and the challenge array from `const CHALLENGES = [` to the next `];`. Reword or
reformat any of those and the verifier exits with `markers not found`. If you
must move them, update `dev/verify-html.js` in the same commit.

## Accessibility rules (learned the hard way)

- **12px is the floor for on-screen text.** Nothing in the screen stylesheet goes
  below it. The `.dro-label` readouts were once 9px — the smallest and most
  important text in the UI.
- **Print CSS is exempt.** `#report` styles inside `@media print` legitimately use
  10–11px. That is correct for the medium; do not "fix" them.
- **Do not put a live region on the numeric readout.** `#toast` and `.dro-msg`
  carry `role="status" aria-live="polite"`. The continuously-updating numeric
  readout deliberately does not — announcing it floods a screen reader.
- **`#fileInput` keeps `display:none`.** It is a real `<input type="file">` opened
  via `.click()` from the Load button, so it is already keyboard-reachable.
  Hiding it does not remove it from the tab order. This is the correct pattern
  here even though it is wrong in the sibling `laser-ready` project.

## Layout invariants

- `body` is `display:flex; flex-direction:column; overflow:hidden` with
  `main{flex:1}`. New top-level chrome must be added as a **flex child of body**,
  not absolutely positioned, or `main` will not yield the height and the new
  element gets clipped.
- The print stylesheet starts with `body>*{display:none !important}` and then
  re-shows `#report`. **Any new top-level element is therefore hidden in print by
  default** — which is usually what you want, but check if it isn't.
- Canvas sizing needs an explicit `resize()` on mode change plus the existing
  `ResizeObserver`; without it gears render as ellipses after a tab toggle.

## Verification expectations

Unit tests are necessary but not sufficient for UI work. Changes to placement,
dragging, meshing, or rendering get driven in a real browser (Chromium is
available; 1280×720 is the reference viewport) before being called done. State
what you actually exercised, not what you assume works.

## Scope discipline

Presentation, accessibility, and UX passes leave the solver untouched — say so
explicitly when it's true, and if a change does reach the physics, call that out
rather than burying it in a UI commit.

## Teacher-facing behavior worth preserving

- `Alt+Shift+U` and `?unlock=all` unlock all challenge tiers.
- Challenge definitions are a plain, editable JSON-ish block in `index.html`;
  keep them readable and comment-annotated for non-programmers.
- Known cosmetic limitation: meshed teeth are not phase-aligned in the drawing.
  Ratios, speeds, and torques are exact. Don't file this as a bug.

## Branding and attribution

Footer carries: Designed by Bill Van Loo (billvanloo.com), the AI-tools
disclaimer, Report a bug / Request a feature (`mailto:` with a
`[GearTrainWorkbench]` subject tag), Ko-fi support, MIT License, and View source.
Keep this consistent with the sibling tools (e.g. `laser-ready`).
