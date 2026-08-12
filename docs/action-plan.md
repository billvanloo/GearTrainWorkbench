# Gear Train Workbench — Action Plan

Response to the evaluation report of **August 12, 2026** (usability, functionality, accessibility). This plan turns each finding into a concrete, code-anchored change, grouped by the report's own priority tiers. Line references are to `index.html` at the time of writing.

## Guiding constraints

Any change must preserve the project's core properties:

- **Single self-contained file.** No external dependencies; the tool must keep opening offline from `index.html` alone. No CDN, no build step for the shipped artifact.
- **Solver stays pure and tested.** If solver logic changes, edit `dev/solver.js` first, run `node dev/test.js` (29 tests), sync the inline copy in `index.html`, then run `node dev/verify-html.js`. None of the changes below require solver changes — they are UI, persistence, and accessibility work — so the solver and its 29 tests should remain green throughout.
- **Math stays exact.** The report confirms all seven challenges are solvable with exact answers. No change here alters ratio/speed/torque/direction math.

Because there is no test harness for the DOM/canvas layer, each phase below lists a **manual verification** checklist. Phase 5 proposes adding lightweight automated coverage so future UI changes are not untested.

---

## Phase 1 — Fix first (affects learning or shuts students out)

### 1.1 Re-hide the readout after each attempt (prediction-gate leak)

**Report:** Once "Run train" is pressed once, the live readout stays visible for the rest of the challenge; attempt two can be read off the screen.

**Root cause:** `runChallenge()` sets `S.revealed=true` (line 1223) and it is never reset until the mode/challenge is switched (`openChallenge` sets `S.revealed=false` at line 1174). The whole render pipeline gates on `S.revealed`:
- readout hide: `const hide = (S.mode==='challenge' && !S.revealed)` (line 688)
- animation: `animate = solved && ... && (S.mode==='sandbox' || S.revealed)` (line 715)
- scene reveal: line 723.

**Approach:**
1. Introduce a short-lived reveal window instead of a sticky boolean. After a run, keep the result table (`#chResult`) visible (that is the record of *that* attempt), but re-arm the gate so the next prediction is required before the *live* readout/animation returns.
2. Concretely: after computing and showing the result in `runChallenge()`, set `S.revealed=false` again once the student begins a new prediction. Cleanest trigger: reset `S.revealed=false` when any prediction input (`pred.rpm/torque/dir`) changes after a completed run, and require a fresh "Run" to reveal. Track this with a per-attempt flag, e.g. `S.gateArmed`.
3. The result table for the just-finished attempt persists (it is historical, not the live readout), so students still see how they did — they just cannot use the *live spinning readout* as an answer key for the next prediction.

**Also (report's paired recommendation):** record each attempt's prediction + result so a teacher sees reasoning improve. Add an `S.attemptLog[ch.id] = [{n, pred, actual, pass, ts}, …]` array, appended in `runChallenge()` (data already computed there as `p`, `sv.out`, `ev`). Render this log into the exported report/PDF (see 2.1) and the printable run record.

**Touch points:** `runChallenge()` (1220–1258), the prediction input handlers, `renderChallengeDetail()` (1181), the render gate at lines 688/715/723.

**Manual verification:** In a challenge, predict → Run → confirm live readout hides again and inputs are cleared/required; make a second prediction → Run → confirm second attempt is independently gated; confirm the result table and attempt count still update; confirm Sandbox mode is unaffected (always revealed).

### 1.2 Make the front/back planes obvious

**Report:** The two planes differ only by a ~1.2:1 gray brightness (`#DCE1E6` front vs `#C4CCD4` back, lines 544 & 548); this is the #1 "why won't these mesh?" confusion. Also: no message when a drop fails because gears are on different planes.

**Approach (redundant, non-color-only cues):**
1. **Distinct treatment per plane** in `drawScene()` (lines 537–573): give the back plane a visible hatch/cross-hatch fill or a heavier dashed outline, in addition to the existing gray, so the difference survives low-contrast displays and color-blindness. Keep front plane clean.
2. **Hub tag "F"/"B"** on each gear/shaft hub (the hub badge block at lines 576–599 is the natural place), so the plane is legible even on a static screenshot and to a partially-sighted user.
3. **Explicit failure message.** `computeSnap()` (line 775) and `sameLayerOverlap()` (line 765) already know when two gears overlap without meshing; surface a specific toast ("These gears are on different planes — they can't mesh. Move one to the same plane.") when a drop is rejected for a plane mismatch, distinct from the generic overlap message. This reuses the existing `toast()` mechanism.

**Touch points:** `drawScene()` gear fill/stroke (537–573) and hub badges (576–599); `computeSnap()`/`sameLayerOverlap()` (765–800) drop-rejection path; `toast()`.

**Manual verification:** Place gears on both planes → visually distinct beyond gray; hub shows F/B; attempt to mesh across planes → specific message; confirm PNG export (line 1263 `snapshotDataURL`) also shows the distinction (it calls the same `drawScene`).

### 1.3 Keyboard path + screen-reader description for the whole workflow

**Report:** The canvas has no keyboard access and no accessible name/description. A pointer-only user or a screen-reader user cannot use the tool at all.

**Approach:**
1. **Keyboard operation.** Make the canvas (or a focusable overlay) `tabindex="0"` with a roving "selected gear" model (state already has `S.selectedGear`, used at line 545). Bindings:
   - Tab / arrow-through the palette to pick a gear size, Enter to place at a default spot (reuse `placeGearAt`, line 935).
   - Arrow keys nudge the selected gear (mutate its shaft `x/y`, then `resolve()`); Shift+arrow for coarse steps.
   - A "mesh with nearest" key (e.g. `m`) that runs the existing `computeSnap()` search against nearby gears and applies the best same-plane snap.
   - A key to toggle the selected gear's plane (front/back), and keys to attach motor/load to the selected shaft.
2. **Accessible name + live text summary.** Give the canvas an `aria-label` and pair it with an off-screen (visually-hidden) `aria-live="polite"` region that `resolve()` updates with a running text description of the train, e.g. *"12-tooth driver on the motor shaft, meshed with a 24-tooth gear, load attached. Ratio 2:1, output 60 RPM CCW."* All of this data is already computed in `solved` (shaftRpm, meshes, out) — this is a serialization of existing state, not new math.

**Touch points:** canvas element markup; a new `describeTrain(solved)` helper called from `resolve()` (678); keydown handler on the canvas; reuse of `placeGearAt`, `computeSnap`, `resolve`.

**Manual verification:** Unplug the mouse — place, nudge, mesh, stack a compound pair, attach motor/load, run a challenge using only the keyboard. With a screen reader (VoiceOver/NVDA), confirm the canvas is named and the live region announces the train after each change. This is the largest single item; see Phase priorities below.

### 1.4 Persist progress in the browser + include name/progress in save file

**Report:** Completed challenges and unlocked tiers live only in page memory; a refresh wipes them. The save file stores layout but not student name or progress.

**Approach:**
1. **`localStorage` persistence.** Persist `S.completed`, `S.attempts`, and (new) `S.attemptLog`, plus the student name field, under a versioned key (e.g. `gtw.progress.v1`). Save on every mutation of these (end of `runChallenge`, and on name-field `input`); load once at startup, before `renderTierList()` (1152) so unlocked tiers reflect saved state. Guard for private-mode/quota failures (try/catch, degrade to in-memory).
2. **Save file carries identity + progress.** Extend the export object in the Save handler (line 1350) from `{version, gears, shafts, motor, load, motorSpecs}` to also include `studentName`, `completed`, `attempts`, and `attemptLog`. Bump `version` to 2. In the Load handler (1357–1378), read these back when present and **keep backward compatibility** with v1 files (all new fields optional). Loading progress should merge/confirm rather than silently overwrite a student's current progress — show a toast and, ideally, ask before replacing.

**Touch points:** state init (`S`, near line 467); `runChallenge()` (1220); Save handler (1349–1355); Load handler (1357–1378); startup sequence near `renderTierList()`.

**Manual verification:** Complete a challenge → refresh → progress and unlocked tiers persist; clear the storage key → back to fresh; Save → inspect JSON contains name + progress; Load a v1 (old) file → still works; Load a v2 file → restores progress.

---

## Phase 2 — Fix next (clear wins for classroom use)

### 2.1 Student name + challenge number in every downloaded filename

**Report:** Every save is `gear-train-design.json` (line 1352); every PNG is date-only (`gear-train-'+t.date...` line 1307). Thirty submissions arrive indistinguishable.

**Approach:** Add a `safeFilename(parts…)` helper that slugifies the student name (already read via `titleLines()`, line 1271) and appends mode/challenge id and date. Apply to:
- PNG: line 1307 → `gear-train_<name>_<challengeOrSandbox>_<date>.png`
- JSON save: line 1352 → `gear-train_<name>_<challengeOrSandbox>_<date>.json`
- Report/PDF run record: same convention.
Slug rules: strip to `[A-Za-z0-9-_]`, collapse spaces to `-`, fall back to `unnamed` when the name box is blank (mirrors the `'(unnamed)'` default at line 1272).

**Touch points:** new helper; PNG handler (1277+, download at 1307); Save handler (1352); report/PDF export.

**Manual verification:** Type a name, export each of the three formats in Sandbox and in a challenge; confirm filenames include name + context + date and are filesystem-safe (test spaces, punctuation, empty name).

### 2.2 Reconcile the "Gears available" list with the palette

**Report:** Each challenge lists allowed gears (`allowed:[…]`, e.g. line 422), but the palette (`PALETTE_TEETH`, line 455) always shows all nine sizes. Instruction ≠ behavior.

**Approach — pick one (recommend A):**
- **A. Enforce.** In challenge mode, disable/hide palette chips whose teeth are not in `S.activeChallenge.allowed`. The palette is built from `PALETTE_TEETH.forEach` (1030); add an update step that toggles a `disabled`/hidden class on each chip when a challenge opens (`openChallenge`, 1170) and restores all in Sandbox/`setMode` (1137). Also reject placement of a disallowed gear as a backstop. This makes constraint tiers (`maxTeeth`, etc.) tangible.
- **B. Reword.** If the design intent is open exploration, relabel the panel to "Suggested gears" in `renderChallengeDetail()` (1181) so the instruction matches the permissive behavior.

Recommend **A** for the numbered tier challenges (they read as prescriptive) and note that the Design Brief 4.1 already allows all nine, so enforcement is a no-op there.

**Touch points:** palette build (1030–…); `openChallenge` (1170) / `setMode` (1137); `renderChallengeDetail` (1181); optional guard in `placeGearAt` (935).

**Manual verification:** Open each challenge → only its `allowed` sizes are usable; switch to Sandbox → all nine return; complete a challenge with the restricted palette.

### 2.3 Honor "reduce motion" for the gear animation

**Report:** The reduced-motion CSS (lines 158–165) covers CSS animations/transitions but not the canvas gears, which spin via `requestAnimationFrame` in `tick()` (713–725). The animation-speed slider to zero is only a manual workaround.

**Approach:** Read the media query in JS: `const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)')`. In `tick()`, gate the angle integration (line 719) so that when `reduceMotion.matches`, shafts do not advance — the scene still renders (correct static positions, arrows, readout) but nothing spins. Add a `change` listener so toggling the OS setting takes effect live. Keep the speed slider as an independent control for users who do want motion. Document that direction is still conveyed by the CW/CCW text and arrows (already the case per the report's "credit where due").

**Touch points:** `tick()` (713–725); one-time `matchMedia` setup near animation init (`requestAnimationFrame(tick)` at 1397).

**Manual verification:** Enable OS "reduce motion" → gears stop, readout still correct; disable → gears spin; toggle live → responds without reload.

### 2.4 Motor-button contrast + small labels

**Report:** Motor gold text ~3:1 on white (below 4.5:1); several labels at 12–13px.

**Approach:** Darken the motor accent used for text to reach ≥4.5:1 on its background. Note the canvas "M" badge uses `#B08A2E` filled with white text (lines 586, 592) — that badge is likely fine; the concern is the **Motor toolbar button's** gold text in the DOM/CSS. Find the button's color token (the `--dykem`/gold custom properties in `:root`) and pick a darker gold that passes 4.5:1, verified with a contrast checker. Bump the flagged 12–13px labels to ≥14px (or the project's base size) without breaking layout at the 860px breakpoint.

**Touch points:** CSS custom properties in `:root` and the motor button rule; label font-size rules. (Grep for the gold hex / `--dykem` usages.)

**Manual verification:** Run the button text and each flagged label through a WCAG contrast tool at the shipped colors; confirm ≥4.5:1 and ≥14px; visually confirm no layout regression.

### 2.5 Widen snap distance and enlarge small-gear grab area

**Report:** Snap only within ~16px (`SNAP=16`, line 777) and the smallest gear is 36px across — fiddly, worse on touch.

**Approach:**
1. Increase the mesh snap tolerance (line 777) — e.g. to ~24px, or make it scale with the smaller gear's radius so tiny gears get a proportionally larger catch zone. `computeSnap()` (775) is the single place.
2. Enlarge the **hit/grab** area for small gears independently of their drawn size: in the pick-test (hit detection used by drag start) add a minimum grab radius (e.g. `max(pitchRadius, 22)`) so an 8T gear is still easy to grab without changing its drawn pitch radius (which must stay exact for meshing visuals).
3. Keep changes conservative so distinct mesh sites near each other don't become ambiguous — verify the "gears overlap without meshing" detection (`sameLayerOverlap`, 765) still triggers correctly.

**Touch points:** `computeSnap()` `SNAP` (777); gear hit-testing in the pointer-down/drag path (around 860–890); regression-check `sameLayerOverlap` (765).

**Manual verification:** On a touchscreen (or emulated touch), grab and mesh the 8T/10T gears in a few tries; confirm dense layouts still distinguish separate mesh points and still flag true overlaps.

### 2.6 "Reset this challenge" button

**Report:** No way to reset one challenge or clear a prediction without switching modes.

**Approach:** Add a "Reset this challenge" button to the challenge detail panel (`renderChallengeDetail`, 1181). On click: clear the current layout (gears/shafts/motor/load — reuse the sandbox-clear path but scoped), clear the prediction inputs, hide `#chResult`, re-arm the gate (`S.revealed=false`), and push an undo snapshot (reuse `pushUndo`/`captureState`, 966) so the reset itself is undoable. Do **not** clear `completed`/`attempts` for that challenge unless the student explicitly asks (keep progress). Optionally add a lighter "Clear prediction" affordance.

**Touch points:** challenge panel markup + `renderChallengeDetail` (1181); reuse clear-layout logic and `pushUndo` (966); gate reset ties into 1.1.

**Manual verification:** Mid-challenge, Reset → board and prediction clear, result hidden, gate re-armed, Undo restores prior state, completed status unchanged.

---

## Phase 3 — Later (worth considering)

### 3.1 Phone layout
Add a narrow-width responsive mode below the current single 860px breakpoint (report: layout stops at 860px, largest gear 270px won't fit). Collapsible tool/challenge panels, allow page scroll, and a pinch-to-zoom / pannable drawing area so a 270px gear fits. This is the largest UI-architecture change and is explicitly "later." Until done, correct the on-screen copy that says "tap" so it doesn't over-promise phone support (ties to being honest about supported devices).

### 3.2 "Show the working" panel
After a run, optionally reveal stage-by-stage ratio math (per-mesh ratios multiplying to the total). The data exists in `solved.meshes` and `solved.shaftRpm`; this is a presentation of existing solver output. Gate it so it appears only *after* the prediction is committed, preserving the gate.

### 3.3 Teacher view + optional friction losses
Collect a class's exported results (builds naturally on the richer save file from 1.4 and named files from 2.1). Separately, an optional non-ideal mode applying friction/efficiency losses so numbers aren't perfectly ideal — this **does** touch the solver, so it must go through `dev/solver.js` → `node dev/test.js` → sync → `node dev/verify-html.js`, with new tests, and must default OFF so existing challenge answers stay exact.

---

## Phase 4 — Documentation & honesty

- Update `README.md` "Features" and `docs/spec.md` to reflect persisted progress, palette enforcement, keyboard/screen-reader support, and reduced-motion handling once shipped.
- Update the in-app help ("?" dialog) to teach the plane rule up front (the report notes this is the top stumbling block) and to document keyboard shortcuts.
- Fix "tap" wording on non-touch-supported builds (see 3.1).

## Phase 5 — Testing the UI layer

The solver is well tested; the DOM/canvas layer is not, which is why every phase above needs manual checks. Proposal:
- Add a small headless test using the already-present dev tooling pattern (Node) plus a lightweight DOM — e.g. jsdom — to cover non-canvas logic: filename slugging (2.1), palette enforcement (2.2), progress persistence serialize/deserialize and v1→v2 save compatibility (1.4/1.1), and the reveal-gate state machine (1.1). Keep it in `dev/` alongside `test.js`, runnable with `node`, and **out of** the shipped `index.html`.
- Canvas rendering (plane cues, snap geometry) stays manual, but factor the pure geometry (`computeSnap` tolerance, grab radius) so it can be unit-tested without a canvas.

---

## Suggested execution order

Report priority is the spine, but sequence within Phase 1 to unblock the rest:

1. **1.1 reveal-gate** and **1.4 persistence** first — they share state plumbing (`attempts`, `completed`, `attemptLog`, name) and 1.4's richer records feed 1.1's teacher-visible reasoning log and 2.1's filenames.
2. **1.2 plane visibility** (self-contained, high user impact, no state coupling).
3. **1.3 keyboard + screen reader** — largest item; can proceed in parallel since it mostly adds handlers around existing `placeGearAt`/`computeSnap`/`resolve`.
4. Phase 2 items are mostly independent; **2.2 palette enforcement** and **2.6 reset** lean on the gate work from 1.1, so do them after it.
5. Phase 3/4/5 as capacity allows; 3.3's solver change is the only item that reopens the tested math path and must clear the full solver test cycle.

Each change is small and localized except 1.3 (keyboard/SR) and 3.1 (phone layout). None requires new dependencies in the shipped file, preserving the offline single-file guarantee.
