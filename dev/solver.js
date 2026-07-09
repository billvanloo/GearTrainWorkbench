// __PURE_BEGIN__
// Gear Train Workbench — pure solver core (no DOM). Testable in node.
// Model: shafts hold 1-2 gears; gears on a shaft co-rotate; meshed gears
// (center distance == sum of pitch radii) counter-rotate by tooth ratio.
// Gears occupy an axial LAYER (0 = front, 1 = back). Meshing and collision
// only happen between gears in the same layer — this is what makes compound
// trains physically possible (big stage-1 gear passes over small stage-2 gears).

const MODULE = 4.5;           // px of pitch diameter per tooth
const MESH_EPS = 2.5;         // px tolerance for "in mesh"
const RPM_EPS = 0.01;

function pitchRadius(teeth) { return teeth * MODULE / 2; }

function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.hypot(dx, dy); }

// state: { gears:[{id,teeth,shaftId}], shafts:[{id,x,y}], motor:{shaftId,rpm,torque}|null, load:{shaftId}|null }
// Returns { ok, error, shaftRpm:{}, shaftTorque:{}, reachable:Set, meshes:[[gidA,gidB]], overlaps:[[gidA,gidB]], out:{rpm,torque,dir}|null, ratioText }
function solve(state) {
  const shaftById = {}; state.shafts.forEach(s => shaftById[s.id] = s);
  const gearsByShaft = {}; state.gears.forEach(g => {
    (gearsByShaft[g.shaftId] = gearsByShaft[g.shaftId] || []).push(g);
  });

  // Find meshes and overlaps between gears on different shafts
  const meshes = [], overlaps = [];
  const gs = state.gears;
  for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
    const a = gs[i], b = gs[j];
    if (a.shaftId === b.shaftId) continue;
    if ((a.layer || 0) !== (b.layer || 0)) continue; // different planes never touch
    const d = dist(shaftById[a.shaftId], shaftById[b.shaftId]);
    const target = pitchRadius(a.teeth) + pitchRadius(b.teeth);
    if (Math.abs(d - target) <= MESH_EPS) meshes.push([a.id, b.id]);
    else if (d < target - MESH_EPS) overlaps.push([a.id, b.id]);
  }

  const res = { ok: true, error: null, shaftRpm: {}, shaftTorque: {}, reachable: new Set(), meshes, overlaps, out: null, ratioText: '—' };

  if (overlaps.length) { res.ok = false; res.error = 'Gears overlap without meshing. Drag them apart or snap them into mesh.'; }

  if (!state.motor) { if (res.ok) res.error = 'Add a motor to power the train.'; res.ok = false; return res; }

  const gearById = {}; gs.forEach(g => gearById[g.id] = g);
  const meshMap = {}; // gearId -> [meshed gearIds]
  meshes.forEach(([a, b]) => {
    (meshMap[a] = meshMap[a] || []).push(b);
    (meshMap[b] = meshMap[b] || []).push(a);
  });

  // BFS from motor shaft, propagating signed rpm (positive = CW)
  const rpm = {}; rpm[state.motor.shaftId] = state.motor.rpm;
  res.reachable.add(state.motor.shaftId);
  const queue = [state.motor.shaftId];
  while (queue.length) {
    const sid = queue.shift();
    const w = rpm[sid];
    for (const g of (gearsByShaft[sid] || [])) {
      for (const hid of (meshMap[g.id] || [])) {
        const h = gearById[hid];
        const wt = -w * (g.teeth / h.teeth);
        if (Object.prototype.hasOwnProperty.call(rpm, h.shaftId)) {
          if (Math.abs(rpm[h.shaftId] - wt) > RPM_EPS) {
            res.ok = false;
            res.error = 'This train is over-constrained: a loop forces one shaft to spin at two different speeds.';
            res.shaftRpm = rpm;
            return res;
          }
        } else {
          rpm[h.shaftId] = wt;
          res.reachable.add(h.shaftId);
          queue.push(h.shaftId);
        }
      }
    }
  }
  res.shaftRpm = rpm;

  // Ideal lossless power conservation: P = rpm * torque
  const P = Math.abs(state.motor.rpm * state.motor.torque);
  for (const sid of res.reachable) {
    const w = Math.abs(rpm[sid]);
    res.shaftTorque[sid] = w > RPM_EPS ? P / w : null;
  }

  // Unreachable gears?
  const unreachable = gs.filter(g => !res.reachable.has(g.shaftId));
  if (res.ok && unreachable.length) {
    res.error = `${unreachable.length} gear${unreachable.length > 1 ? 's are' : ' is'} not connected to the motor.`;
  }

  // Output at the load
  if (state.load && res.reachable.has(state.load.shaftId)) {
    const w = rpm[state.load.shaftId];
    res.out = {
      rpm: Math.abs(w),
      torque: res.shaftTorque[state.load.shaftId],
      dir: w > 0 ? 'CW' : (w < 0 ? 'CCW' : '—')
    };
    if (Math.abs(w) > RPM_EPS) {
      const r = Math.abs(state.motor.rpm) / Math.abs(w);
      res.ratioText = r >= 1 ? `${fmtNum(r)} : 1` : `1 : ${fmtNum(1 / r)}`;
    }
  } else if (state.load) {
    if (res.ok) res.error = 'The load is not connected to the motor.';
  } else if (res.ok && !res.error) {
    res.error = 'Add a load to measure output.';
  }
  return res;
}

function fmtNum(n) {
  if (n == null || !isFinite(n)) return '—';
  const r = Math.round(n * 100) / 100;
  return (Math.abs(r - Math.round(r)) < 1e-9) ? String(Math.round(r)) : String(r);
}

// Challenge evaluation. ch: {target:{rpm,torque,dir,tolPct,minTorque}, constraints:{maxTeeth,maxGears}}
// pred: {rpm, torque, dir}
function evaluateChallenge(ch, state, solved, pred) {
  const problems = [];
  if (!solved.out) { problems.push('No measurable output — check that motor and load are placed and connected.'); return { pass: false, problems, predOk: false, targetOk: false }; }
  if (solved.error && !solved.ok) { problems.push(solved.error); return { pass: false, problems, predOk: false, targetOk: false }; }

  const tol = (ch.target.tolPct != null ? ch.target.tolPct : 2) / 100;
  const within = (a, b) => Math.abs(a - b) <= Math.abs(b) * tol + 1e-9;

  // Constraints
  if (ch.constraints) {
    if (ch.constraints.maxTeeth && state.gears.some(g => g.teeth > ch.constraints.maxTeeth))
      problems.push(`Constraint: no gear may exceed ${ch.constraints.maxTeeth} teeth.`);
    if (ch.constraints.maxGears && state.gears.length > ch.constraints.maxGears)
      problems.push(`Constraint: use at most ${ch.constraints.maxGears} gears.`);
    if (ch.constraints.minGears && state.gears.length < ch.constraints.minGears)
      problems.push(`Constraint: use at least ${ch.constraints.minGears} gears.`);
  }

  // Target check (the built train must do the job)
  let targetOk = true;
  if (ch.target.rpm != null && !within(solved.out.rpm, ch.target.rpm)) { targetOk = false; problems.push(`Output speed is ${fmtNum(solved.out.rpm)} RPM; target is ${fmtNum(ch.target.rpm)} RPM.`); }
  if (ch.target.torque != null && !within(solved.out.torque, ch.target.torque)) { targetOk = false; problems.push(`Output torque is ${fmtNum(solved.out.torque)} N·cm; target is ${fmtNum(ch.target.torque)} N·cm.`); }
  if (ch.target.minTorque != null && solved.out.torque < ch.target.minTorque - 1e-9) { targetOk = false; problems.push(`Output torque is ${fmtNum(solved.out.torque)} N·cm; needs at least ${fmtNum(ch.target.minTorque)} N·cm.`); }
  if (ch.target.rpmWindow && (solved.out.rpm < ch.target.rpmWindow[0] || solved.out.rpm > ch.target.rpmWindow[1])) { targetOk = false; problems.push(`Output speed is ${fmtNum(solved.out.rpm)} RPM; must be between ${ch.target.rpmWindow[0]} and ${ch.target.rpmWindow[1]} RPM.`); }
  if (ch.target.dir && solved.out.dir !== ch.target.dir) { targetOk = false; problems.push(`Output direction is ${solved.out.dir}; target is ${ch.target.dir}.`); }
  if (targetOk === true && problems.length) targetOk = false; // constraint failures count

  // Prediction check (the gate)
  let predOk = true;
  if (!within(pred.rpm, solved.out.rpm)) { predOk = false; }
  if (!within(pred.torque, solved.out.torque)) { predOk = false; }
  if (pred.dir !== solved.out.dir) { predOk = false; }

  return { pass: targetOk && predOk, predOk, targetOk, problems };
}
// __PURE_END__

if (typeof module !== 'undefined') module.exports = { MODULE, MESH_EPS, pitchRadius, solve, evaluateChallenge, fmtNum };
