# Gear Train Workbench — Functional Specification

**Version:** 0.1 (draft)
**Platform:** Single self-contained HTML file, vanilla JS, offline-capable, Chromebook-friendly
**Author:** Bill (with Claude)

---

## 1. Purpose & Pedagogy

An interactive simulation where students design gear trains and predict their behavior before running them. The core pedagogical mechanic is the **prediction gate**: in challenge mode, students must calculate output speed, torque, and direction before the animation runs. Prediction over guessing.

The simulation is a **stepped challenge**: students begin with simple two-gear meshes and progress to compound gear trains, unlocking complexity as they demonstrate mastery.

Learning objectives:

1. Predict output speed, torque, and rotation direction for simple and compound gear trains
2. Design gear trains that satisfy quantitative constraints
3. Explain the speed–torque tradeoff quantitatively and qualitatively

Standards connections: NGSS science and engineering practices (mathematical/computational thinking, using simulations based on mathematical models); CCSS ratio and proportional reasoning; STEL mechanical systems; general engineering-education gear ratio and mechanical advantage content.

---

## 2. Locked Design Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Gear mechanics model | **Spatial** — gears occupy real 2D positions; meshing requires correct center distance; generous snap-assist when dragging near mesh |
| 2 | Shafts | **First-class objects from day one** — every gear is mounted on a shaft; compound trains are two gears on one shaft |
| 3 | Prediction gate | **Core to challenge mode**; sandbox mode is always available for free exploration |
| 4 | Student output | **Clean downloadable image (PNG) and PDF report** — first-class feature, not an afterthought |
| 5 | Units | **Real units** (RPM, N·cm) with challenge values chosen for tidy arithmetic |

---

## 3. Modes

### 3.1 Sandbox Mode
Free exploration. All parts available. Live readouts always visible. No scoring, no gates. Intended for demos, teacher-led instruction, and student tinkering.

### 3.2 Challenge Mode (stepped progression)
A sequence of challenge tiers. Each tier must be completed to unlock the next (with a teacher override — see §8).

**Tier 1 — Simple Meshes.** Two gears. Predict direction and output speed. Introduces the ratio concept.

**Tier 2 — Gear Trains.** Three or more gears in series (each shaft holds one gear). Introduces idler gears — students discover that intermediate gears change direction but not overall ratio.

**Tier 3 — Compound Trains.** Two gears fixed to a shared shaft. Introduces multiplication of stage ratios. Challenges require reductions unachievable in a single mesh (e.g., 12:1 with max 40-tooth gears).

**Tier 4 — Design Challenges.** Constraint-based open problems: achieve a target output torque/speed within a gear budget, size limits, or fixed input/output shaft positions. Multiple valid solutions; scored on constraint satisfaction plus efficiency metrics (fewest gears, smallest total size).

Each challenge follows the same loop:
1. Read the scenario (given: motor specs, target output, constraints)
2. Build the train on the canvas
3. **Prediction gate:** enter predicted output RPM, torque, and direction
4. Run — animation plays, actual values display beside predictions
5. Result: within tolerance → pass; outside → feedback and retry (attempt count recorded)

---

## 4. Simulation Model

### 4.1 Objects

**Gear**
- `id`, `teeth` (8–60), `pitchRadius` (derived: teeth × module / 2; fixed module for all gears so tooth sizes match), `shaftId`, `meshes[]` (gear ids in mesh contact)

**Shaft**
- `id`, `position {x, y}`, `gears[]` (1–2 gear ids), `rpm`, `torque` (computed), `role` (`motor` | `free` | `load`)

**Motor**
- Attached to exactly one shaft. Properties: `rpm` (e.g., 120), `torque` (e.g., 10 N·cm). Idealized constant-speed source (no torque–speed curve in v1; see §10 Future).

**Load**
- Attached to exactly one shaft. Displays received rpm/torque. In design challenges, has requirements (`minTorque`, `targetRpm ± tolerance`).

### 4.2 Physics/Math
- Mesh ratio between gear A driving gear B: `ratioAB = teethB / teethA`
- Meshed gears counter-rotate; gears on a shared shaft co-rotate at the same rpm
- Train solved by breadth-first propagation from the motor shaft
- Torque scales inversely to speed (ideal, lossless: `P_in = P_out`); v1 has no friction/efficiency losses (see §10)
- **Validation:** detect and reject over-constrained systems (loops that force conflicting speeds), unreachable gears (not connected to motor), and colliding-but-not-meshing gears. Errors are teachable messages, not silent failures.

### 4.3 Meshing & Snap Logic
- Two gears mesh when center distance = sum of pitch radii (within snap tolerance)
- During drag, when a gear enters snap range of another gear's mesh circle, ghost-preview the meshed position; release snaps it in
- Gears may not overlap (center distance < sum of pitch radii is rejected with visual feedback)
- Adding a second gear to an existing shaft: drag onto the shaft hub; UI shows a "stack" indicator

---

## 5. UI Layout

```
+--------------------------------------------------------------+
|  [Mode: Sandbox | Challenge]           [Export ▼] [Help]     |
+------------+-------------------------------------------------+
|  PALETTE   |                                                 |
|  Gears:    |               CANVAS                            |
|  8T 12T    |     (pan/zoom, grid, snap guides)               |
|  16T 24T   |                                                 |
|  40T 60T   |                                                 |
|  [Motor]   |                                                 |
|  [Load]    |                                                 |
+------------+-------------------------------------------------+
|  READOUT BAR: Ratio 3:1 | Out 40 RPM | Out 30 N·cm | Dir CW  |
|  CHALLENGE PANEL (challenge mode): scenario, prediction      |
|  inputs, run button, attempt counter                         |
+--------------------------------------------------------------+
```

- **Live readout bar** (sandbox: always live; challenge: hidden until prediction submitted)
- Animation: gears rotate at true relative speeds; speed scale slider (real-time to 10x slow) so fast trains remain readable
- Direction shown by rotation plus per-gear arrow overlays (toggleable)
- Touch support required (Chromebooks with touchscreens); minimum hit targets 44px

---

## 6. Prediction Gate (Challenge Mode)

- Inputs: output RPM (number), output torque (number), direction (CW/CCW toggle)
- Tolerance: ±2% or exact for tidy values (configurable per challenge)
- The **Run** button is disabled until all predictions are entered
- After running: side-by-side "Predicted vs. Actual" display with per-value pass/fail
- Attempts are counted and included in the exported report; no hard attempt cap in v1 (the record itself discourages guessing), but a per-challenge `maxAttempts` field exists in the challenge schema for future use

---

## 7. Export (First-Class Feature)

### 7.1 PNG Image
- One-click "Export Image" renders the current canvas plus the readout values to a clean PNG via `canvas.toDataURL()` — includes student name field, challenge name, date stamp
- No external libraries required

### 7.2 PDF Report
- "Export Report" generates a printable report page: student name, date, challenge, train diagram (canvas snapshot), gear table (teeth, shaft assignments), predicted vs. actual table, attempt count
- Implementation: dedicated print-styled HTML view + browser print-to-PDF (zero dependencies), rendered in a clean layout with `@media print` CSS
- Rationale: print-to-PDF keeps the tool dependency-free and works identically on Chromebooks; a bundled jsPDF fallback is a future option if the print dialog proves clumsy for students

### 7.3 Save/Load Design
- Export/import train designs as JSON files (no browser storage — designs persist as downloadable files students keep in Google Drive)

---

## 8. Teacher Features

- **Challenge definitions in a JSON block** at the top of the file (or loadable via file picker) — editable without touching code
- Challenge schema: `id`, `tier`, `title`, `scenario`, `motor {rpm, torque}`, `constraints {maxTeeth, maxGears, budget}`, `target {rpm, torque, direction, tolerance}`, `maxAttempts (optional)`
- **Teacher override:** a keyboard shortcut or query parameter (`?unlock=all`) unlocks all tiers for demos and differentiation
- Progression state is session-only (no accounts); the exported reports are the record of student work

---

## 9. Functional Test Outline

### Math/model tests
1. Two-gear mesh 12T→24T: ratio 2:1, output rpm halves, torque doubles, direction reverses
2. Idler chain 12T→16T→24T: overall ratio 2:1 (idler cancels), direction same as two-gear equivalent reversed once more
3. Compound: 12T→40T on shaft with 10T→30T: overall ratio 10:1
4. Power conservation: `rpm_in × torque_in = rpm_out × torque_out` for all valid trains
5. Disconnected gear: flagged unreachable, excluded from readouts
6. Conflicting loop: detected and reported as over-constrained
7. Overlapping placement: rejected

### Interaction tests
8. Snap-assist engages within tolerance and produces exact mesh distance
9. Second gear added to occupied shaft co-rotates at shaft rpm
10. Prediction gate blocks Run until all three predictions entered
11. Tolerance check: prediction within ±2% passes; outside fails
12. Tier unlock triggers only on challenge completion; `?unlock=all` opens all tiers

### Export tests
13. PNG export includes canvas, readouts, name, date
14. PDF report contains all required sections and paginates cleanly
15. JSON save/load round-trips a compound train losslessly

### Performance targets
16. 60fps animation with 8 gears on a mid-range Chromebook; degrade gracefully to 30fps

---

## 10. Phased Milestones

**Phase 1 — Core sandbox (build first)**
Canvas, palette, spatial placement with snap-assist, shafts (single gear), motor/load, live solver + readouts, animation, PNG export.

**Phase 2 — Challenge engine**
Challenge JSON schema + loader, prediction gate, tiers 1–2, attempt tracking, PDF report export.

**Phase 3 — Compound trains + design challenges**
Two-gears-per-shaft interaction, tiers 3–4, constraint scoring, JSON save/load, teacher unlock.

**Future (out of scope for v1)**
Motor torque–speed curves, efficiency/friction losses, belt/chain drives and sprockets, rack-and-pinion, per-student progress persistence.

---

## 11. Open Questions

1. Gear palette: fixed set of tooth counts (8, 10, 12, 16, 20, 24, 30, 40, 60) or a "custom teeth" input? (Recommend fixed set for v1 — mirrors a physical kit and keeps challenges solvable by design.)
2. Should the FBD-style "show the math" panel (ratio chain worked out symbolically) be in v1 or Phase 3?
3. Do challenge tiers need per-section variation (different numbers per class period) to limit answer-sharing?
