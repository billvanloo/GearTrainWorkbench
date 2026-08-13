# Gear Train Workbench

An interactive gear train simulator — a tool for engineering education covering mechanisms and gear systems. Students place gears on shafts, mesh them into simple, idler, and compound trains, and predict speed, torque, and direction before running — with real units (RPM, N·cm) throughout.

## Quick start

**Online:** enable GitHub Pages for this repo (Settings → Pages → Deploy from a branch → `main`, `/ (root)`) and share the resulting URL. Students need nothing but a browser.

**Offline:** download `index.html` and open it in any browser. The entire tool is one self-contained file with no external dependencies — it works on Chromebooks with no network at all.

## Features

- Spatial gear placement with snap-assist meshing; shafts are first-class objects (two gears on one shaft = compound stage)
- Two axial planes so compound trains are physically valid — gears only mesh on the same plane, marked with an F/B tag on every hub and a hatch on the back plane
- Prediction gate in challenge mode: students commit to predicted output RPM, torque, and direction before the solver runs — and the readout re-hides after every attempt, so each run needs a fresh prediction
- Four gated challenge tiers, from simple meshes through a design brief (a winch requiring 14–16 RPM and ≥ 60 N·cm in ≤ 6 gears); in a challenge the palette is limited to the sizes the brief lists
- Progress (completed challenges, attempts, name) persists in the browser and survives a refresh
- Optional "Show the working" panel that breaks the ratio down mesh by mesh (gated behind the prediction, so it never leaks an answer early)
- Fully keyboard-operable, with a screen-reader description of the train and support for the OS "reduce motion" setting
- Light ("engineering paper") and dark ("Blueprint") themes — every colour, canvas included, is theme-driven; the choice follows the OS on first visit, persists, and applies before first paint (exports always render ink-on-paper)
- Sandbox mode, JSON save/load, PNG export with title block, print-to-PDF run record — all named with the student, challenge, and date

## Teacher notes

- Unlock all challenge tiers with **Alt+Shift+U** or by loading the page with `?unlock=all`
- Challenge definitions live in a plain JSON block inside `index.html` — edit targets, tolerances, and part budgets freely
- Progress is stored in the browser's `localStorage`; the JSON save file also carries the student's name and progress, so a student can hand in one file or move between machines
- The printable report includes an attempt-by-attempt history, so you can see a student's reasoning improve rather than only a final pass
- Have students type their name in the Name box before exporting — every download is then named with the student, challenge, and date
- Known cosmetic limitation: meshed teeth are not phase-aligned in the drawing; ratios, speeds, and torques are exact

## Development

The physics solver and the non-canvas UI logic are pure modules, developed and tested outside the browser (no dependencies — just Node):

```
cd dev
node test.js          # 29 solver unit tests (ratios, torque conservation, direction, error cases)
node verify-html.js   # confirms the inline solver in index.html matches, and validates every challenge
node test-logic.js    # 40 UI-logic unit tests (filenames, palette limits, snap geometry,
                      #   progress serialize/merge, the reveal-gate machine, "show the working")
node verify-logic.js  # confirms the inline UI-logic copy in index.html is in sync (text + behavior)
```

Two pure cores live in `dev/` and are embedded verbatim in `index.html`, where thin DOM wrappers delegate to them:

- **`dev/solver.js`** — the physics (meshes, speeds, torques, direction, validation).
- **`dev/logic.js`** — the non-canvas decisions: download naming, per-challenge palette limits, snap/grab geometry, progress serialization + save-file merge, the reveal-gate state machine, and the motor→load stage reconstruction behind "Show the working".

If you edit either, change the module in `dev/` first, run its unit tests, then sync the inline copy in `index.html` (the block between the `__PURE_BEGIN__`/`__PURE_END__` markers) and run the matching `verify-*.js`. Canvas rendering and pointer interaction are still verified by hand.

`docs/spec.md` is the original functional specification.

This was built using Claude. Please don’t use this tool if you have qualms about using code created with AI tools.

## Privacy

Everything runs in your browser. Nothing you build is uploaded to a server.

## Credits & support

- Designed by **[Bill Van Loo](https://billvanloo.com)**
- Found a bug or want a feature? Email `billvanloo.tech+feedback@gmail.com` (the subject line is pre-filled from the in-app links).
- If this tool saved you time, you can [support the work on Ko-fi](https://ko-fi.com/billvanloo).

## License

[MIT](LICENSE) © 2026 Bill Van Loo
