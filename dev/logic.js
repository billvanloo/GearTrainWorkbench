// Gear Train Workbench — pure UI-logic core (no DOM). Testable in node.
//
// These are the non-canvas decision functions that back the interface:
// download naming, per-challenge palette limits, snap/grab geometry, progress
// serialization + save-file merge, the reveal-gate state machine, and the
// motor->load stage reconstruction behind "Show the working". They take plain
// arguments so they can be unit-tested without a browser. index.html carries a
// verbatim copy of the block between the __PURE_BEGIN__/__PURE_END__ markers;
// dev/verify-logic.js checks that copy matches this one and behaves the same.
//
// Pass pitchRadius / MESH_EPS in from the solver core so there is a single
// source of truth for the gear geometry constants.

// __PURE_BEGIN__
const GRAB_MIN = 24;        // px floor on a gear's grab radius (touch-friendly)
const SNAP_TOLERANCE = 24;  // px window for snapping into mesh while dragging

// Filesystem-safe download base: student, context, and date, so a class of
// submissions is not a pile of identical files. opts: {student, mode,
// challengeId, dateISO}.
function slug(s) { return (s || '').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unnamed'; }
function buildExportName(opts) {
  const who = slug(opts.student);
  const ctx = (opts.mode === 'challenge' && opts.challengeId) ? 'challenge-' + opts.challengeId : 'sandbox';
  return 'gear-train_' + who + '_' + ctx + '_' + opts.dateISO;
}

// In a challenge, only the sizes the brief lists may be placed. Sandbox (no
// active challenge, or no `allowed` list) permits every size.
function isGearAllowed(challenge, mode, teeth) {
  if (mode !== 'challenge' || !challenge || !challenge.allowed) return true;
  return challenge.allowed.indexOf(teeth) !== -1;
}

// Grab radius has a floor so the smallest gears stay easy to pick up on touch.
function grabRadius(teeth, pitchRadius) { return Math.max(pitchRadius(teeth) + 5, GRAB_MIN); }

// True when `gear` at `pos` would overlap a different-shaft gear on the SAME
// plane (collision). shaftById(id) -> {x,y}.
function overlapsSameLayer(gear, pos, gears, shaftById, pitchRadius, MESH_EPS) {
  for (const h of gears) {
    if (h.id === gear.id || h.shaftId === gear.shaftId) continue;
    if ((h.layer || 0) !== (gear.layer || 0)) continue;
    const hs = shaftById(h.shaftId);
    const d = Math.hypot(pos.x - hs.x, pos.y - hs.y), target = pitchRadius(gear.teeth) + pitchRadius(h.teeth);
    if (d < target - MESH_EPS) return true;
  }
  return false;
}

// The gear on the OTHER plane that `gear` lines up with at a mesh distance —
// they look like they should connect but won't. Returns that gear, or null.
function crossPlaneNearMesh(gear, pos, gears, shaftById, pitchRadius, MESH_EPS) {
  for (const h of gears) {
    if (h.id === gear.id || h.shaftId === gear.shaftId) continue;
    if ((h.layer || 0) === (gear.layer || 0)) continue;
    const hs = shaftById(h.shaftId);
    const d = Math.hypot(pos.x - hs.x, pos.y - hs.y), target = pitchRadius(gear.teeth) + pitchRadius(h.teeth);
    if (Math.abs(d - target) <= MESH_EPS + 2) return h;
  }
  return null;
}

// Progress snapshot for localStorage / save files.
function serializeProgress(progress, student) {
  return {
    student: (student || '').trim(),
    completed: progress.completed, attempts: progress.attempts, attemptLog: progress.attemptLog
  };
}

// Non-destructive merge of a loaded file's progress onto the current session:
// completed is unioned, attempts take the max, and an attempt log is adopted
// only where the session has none. Never wipes progress already made. Returns
// {completed, attempts, attemptLog, merged}.
function mergeLoadedProgress(current, fileProgress) {
  const out = {
    completed: Object.assign({}, current.completed),
    attempts: Object.assign({}, current.attempts),
    attemptLog: Object.assign({}, current.attemptLog),
    merged: false
  };
  if (!fileProgress) return out;
  if (fileProgress.completed) { for (const k in fileProgress.completed) if (fileProgress.completed[k]) out.completed[k] = true; out.merged = true; }
  if (fileProgress.attempts) { for (const k in fileProgress.attempts) out.attempts[k] = Math.max(out.attempts[k] || 0, fileProgress.attempts[k] || 0); out.merged = true; }
  if (fileProgress.attemptLog) { for (const k in fileProgress.attemptLog) if (!out.attemptLog[k] || !out.attemptLog[k].length) out.attemptLog[k] = fileProgress.attemptLog[k]; out.merged = true; }
  return out;
}

// Reveal-gate state machine (challenge mode). state:{revealed,resultShown}.
// A run reveals the result; editing a prediction / Predict again / Reset
// re-arms the gate (hides the live readout and the answer) only if a result
// is currently shown; sandbox is always revealed.
function gateStep(state, event) {
  const s = { revealed: state.revealed, resultShown: state.resultShown };
  switch (event) {
    case 'OPEN_CHALLENGE': s.revealed = false; s.resultShown = false; break;
    case 'RUN': s.revealed = true; s.resultShown = true; break;
    case 'EDIT_PREDICTION':
    case 'PREDICT_AGAIN':
    case 'RESET': if (s.resultShown) { s.resultShown = false; s.revealed = false; } break;
    case 'ENTER_SANDBOX': s.revealed = true; s.resultShown = false; break;
  }
  return s;
}

// Ordered mesh stages from the motor shaft to the load shaft, reconstructed
// from the solver's mesh list — each {driver, driven} gear (driver upstream).
// [] when motor and load share a shaft; null when there is no connected path.
function motorToLoadStages(gears, motorShaft, loadShaft, meshes, reachableHas) {
  if (!motorShaft || !loadShaft || !reachableHas(loadShaft)) return null;
  const gearById = {}; gears.forEach(g => gearById[g.id] = g);
  const adj = {};
  meshes.forEach(([a, b]) => {
    const ga = gearById[a], gb = gearById[b]; if (!ga || !gb) return;
    (adj[ga.shaftId] = adj[ga.shaftId] || []).push({ to: gb.shaftId, driver: ga, driven: gb });
    (adj[gb.shaftId] = adj[gb.shaftId] || []).push({ to: ga.shaftId, driver: gb, driven: ga });
  });
  if (motorShaft === loadShaft) return [];
  const prev = {}, seen = new Set([motorShaft]), q = [motorShaft];
  while (q.length) {
    const s = q.shift(); if (s === loadShaft) break;
    for (const e of (adj[s] || [])) if (!seen.has(e.to)) { seen.add(e.to); prev[e.to] = { from: s, edge: e }; q.push(e.to); }
  }
  if (!(loadShaft in prev)) return null;
  const stages = []; let cur = loadShaft;
  while (cur !== motorShaft) { const p = prev[cur]; if (!p) return null; stages.unshift(p.edge); cur = p.from; }
  return stages;
}
// __PURE_END__

if (typeof module !== 'undefined') module.exports = {
  GRAB_MIN, SNAP_TOLERANCE, slug, buildExportName, isGearAllowed, grabRadius,
  overlapsSameLayer, crossPlaneNearMesh, serializeProgress, mergeLoadedProgress,
  gateStep, motorToLoadStages
};
