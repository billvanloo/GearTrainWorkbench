# Gear Train Workbench

An interactive gear train simulator — a tool for engineering education covering mechanisms and gear systems. Students place gears on shafts, mesh them into simple, idler, and compound trains, and predict speed, torque, and direction before running — with real units (RPM, N·cm) throughout.

## Quick start

**Online:** enable GitHub Pages for this repo (Settings → Pages → Deploy from a branch → `main`, `/ (root)`) and share the resulting URL. Students need nothing but a browser.

**Offline:** download `index.html` and open it in any browser. The entire tool is one self-contained file with no external dependencies — it works on Chromebooks with no network at all.

## Features

- Spatial gear placement with snap-assist meshing; shafts are first-class objects (two gears on one shaft = compound stage)
- Two axial layers so compound trains are physically valid — gears only mesh on the same layer
- Prediction gate in challenge mode: students commit to predicted output RPM, torque, and direction before the solver runs
- Four gated challenge tiers, from simple meshes through a design brief (a winch requiring 14–16 RPM and ≥ 60 N·cm in ≤ 6 gears)
- Sandbox mode, JSON save/load, PNG export with title block, print-to-PDF run record

## Teacher notes

- Unlock all challenge tiers with **Alt+Shift+U** or by loading the page with `?unlock=all`
- Challenge definitions live in a plain JSON block inside `index.html` — edit targets, tolerances, and part budgets freely
- Known cosmetic limitation: meshed teeth are not phase-aligned in the drawing; ratios, speeds, and torques are exact

## Development

The physics solver is a pure module, developed and tested outside the browser:

```
cd dev
node test.js         # 29 unit tests (ratios, torque conservation, direction, error cases)
node verify-html.js  # confirms the inline copy in index.html matches, and validates every challenge
```

If you edit the solver, edit `dev/solver.js` first, run the tests, then sync the inline copy in `index.html` and run `verify-html.js`.

`docs/spec.md` is the original functional specification.
