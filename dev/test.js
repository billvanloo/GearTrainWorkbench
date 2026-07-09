const { pitchRadius, solve, evaluateChallenge } = require('./solver.js');

let passed = 0, failed = 0;
function eq(name, actual, expected, eps = 0.01) {
  const ok = (typeof expected === 'number') ? Math.abs(actual - expected) <= eps : actual === expected;
  if (ok) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}: got ${actual}, expected ${expected}`); }
}

// Helper: build state where shafts are positioned for exact mesh along x-axis
function mkTrain(gearSpecs) {
  // gearSpecs: array of arrays — each inner array = teeth on one shaft, meshing chain via first gear listed
  // Chain rule: shaft i+1 meshes its FIRST gear (same layer) with the LAST gear of shaft i.
  // Layers: shaft's first gear inherits the layer of the gear it meshes with;
  // a second gear on the shaft goes to the other layer.
  const shafts = [], gears = [];
  let x = 0, gid = 0, prevLayer = 0;
  gearSpecs.forEach((teethList, i) => {
    if (i > 0) {
      const prev = gearSpecs[i - 1];
      x += pitchRadius(prev[prev.length - 1]) + pitchRadius(teethList[0]);
    }
    shafts.push({ id: 's' + i, x, y: 0 });
    teethList.forEach((t, k) => {
      const layer = (k === 0) ? prevLayer : 1 - prevLayer;
      gears.push({ id: 'g' + (gid++), teeth: t, shaftId: 's' + i, layer });
      prevLayer = layer;
    });
  });
  return { shafts, gears, motor: null, load: null };
}

console.log('T1: 12T -> 24T simple mesh');
{
  const st = mkTrain([[12], [24]]);
  st.motor = { shaftId: 's0', rpm: 120, torque: 10 };
  st.load = { shaftId: 's1' };
  const r = solve(st);
  eq('ok', r.ok, true);
  eq('out rpm', r.out.rpm, 60);
  eq('out torque', r.out.torque, 20);
  eq('direction reversed', r.out.dir, 'CCW');
  eq('ratio text', r.ratioText, '2 : 1');
}

console.log('T2: idler chain 12T -> 20T -> 24T');
{
  const st = mkTrain([[12], [20], [24]]);
  st.motor = { shaftId: 's0', rpm: 120, torque: 10 };
  st.load = { shaftId: 's2' };
  const r = solve(st);
  eq('overall ratio unaffected by idler (rpm)', r.out.rpm, 60);
  eq('torque', r.out.torque, 20);
  eq('two meshes -> same direction as motor', r.out.dir, 'CW');
}

console.log('T3: compound 10T -> 40T, [40T+10T shaft] -> 30T = 12:1');
{
  const st = mkTrain([[10], [40, 10], [30]]);
  st.motor = { shaftId: 's0', rpm: 120, torque: 5 };
  st.load = { shaftId: 's2' };
  const r = solve(st);
  eq('out rpm 120/12', r.out.rpm, 10);
  eq('out torque 5*12', r.out.torque, 60);
  eq('dir (two meshes)', r.out.dir, 'CW');
  eq('ratio text', r.ratioText, '12 : 1');
}

console.log('T4: power conservation across arbitrary train');
{
  const st = mkTrain([[16], [24, 12], [20]]);
  st.motor = { shaftId: 's0', rpm: 90, torque: 8 };
  st.load = { shaftId: 's2' };
  const r = solve(st);
  eq('P_in == P_out', r.out.rpm * r.out.torque, 90 * 8, 0.001);
}

console.log('T5: disconnected gear flagged');
{
  const st = mkTrain([[12], [24]]);
  st.shafts.push({ id: 'sX', x: 999, y: 999 });
  st.gears.push({ id: 'gX', teeth: 16, shaftId: 'sX' });
  st.motor = { shaftId: 's0', rpm: 120, torque: 10 };
  st.load = { shaftId: 's1' };
  const r = solve(st);
  eq('still solves', r.out.rpm, 60);
  eq('error mentions disconnection', /not connected/.test(r.error), true);
}

console.log('T6: conflicting loop detected');
{
  // Triangle of three shafts where geometry meshes all three pairs -> odd cycle = conflict
  // Use three equal 20T gears at mutual distance = 2*r
  const r20 = pitchRadius(20);
  const d = 2 * r20;
  const st = {
    shafts: [
      { id: 's0', x: 0, y: 0 },
      { id: 's1', x: d, y: 0 },
      { id: 's2', x: d / 2, y: d * Math.sqrt(3) / 2 }
    ],
    gears: [
      { id: 'g0', teeth: 20, shaftId: 's0' },
      { id: 'g1', teeth: 20, shaftId: 's1' },
      { id: 'g2', teeth: 20, shaftId: 's2' }
    ],
    motor: { shaftId: 's0', rpm: 120, torque: 10 },
    load: { shaftId: 's2' }
  };
  const r = solve(st);
  eq('flagged not ok', r.ok, false);
  eq('over-constrained message', /over-constrained/.test(r.error), true);
}

console.log('T7: overlapping gears rejected');
{
  const st = mkTrain([[24], [24]]);
  st.shafts[1].x -= 20; // shove into overlap
  st.motor = { shaftId: 's0', rpm: 120, torque: 10 };
  st.load = { shaftId: 's1' };
  const r = solve(st);
  eq('flagged not ok', r.ok, false);
  eq('overlap message', /overlap/.test(r.error), true);
}

console.log('T8: speed-up train 40T -> 10T');
{
  const st = mkTrain([[40], [10]]);
  st.motor = { shaftId: 's0', rpm: 120, torque: 10 };
  st.load = { shaftId: 's1' };
  const r = solve(st);
  eq('rpm x4', r.out.rpm, 480);
  eq('torque /4', r.out.torque, 2.5);
  eq('ratio text speed-up', r.ratioText, '1 : 4');
}

console.log('T9: challenge evaluation — prediction gate');
{
  const st = mkTrain([[12], [24]]);
  st.motor = { shaftId: 's0', rpm: 120, torque: 10 };
  st.load = { shaftId: 's1' };
  const solved = solve(st);
  const ch = { target: { rpm: 60, torque: 20, dir: 'CCW', tolPct: 2 }, constraints: {} };
  const good = evaluateChallenge(ch, st, solved, { rpm: 60, torque: 20, dir: 'CCW' });
  eq('correct prediction passes', good.pass, true);
  const badPred = evaluateChallenge(ch, st, solved, { rpm: 30, torque: 20, dir: 'CCW' });
  eq('wrong prediction fails gate', badPred.pass, false);
  eq('...but target still ok', badPred.targetOk, true);
}

console.log('T10: challenge constraints enforced');
{
  const st = mkTrain([[12], [60]]);
  st.motor = { shaftId: 's0', rpm: 120, torque: 10 };
  st.load = { shaftId: 's1' };
  const solved = solve(st);
  const ch = { target: { rpm: 24, torque: 50, dir: 'CCW', tolPct: 2 }, constraints: { maxTeeth: 40 } };
  const r = evaluateChallenge(ch, st, solved, { rpm: 24, torque: 50, dir: 'CCW' });
  eq('maxTeeth violation fails', r.pass, false);
  eq('problem lists constraint', r.problems.some(p => /40 teeth/.test(p)), true);
}

console.log('T11: design-window challenge (tier 4 style)');
{
  // 8:1 -> 15 RPM, 80 N·cm from 120/10: 10->40 compound 12->24
  const st = mkTrain([[10], [40, 12], [24]]);
  st.motor = { shaftId: 's0', rpm: 120, torque: 10 };
  st.load = { shaftId: 's2' };
  const solved = solve(st);
  eq('rpm 15', solved.out.rpm, 15);
  const ch = { target: { rpmWindow: [14, 16], minTorque: 60, tolPct: 2 }, constraints: { maxGears: 6 } };
  const r = evaluateChallenge(ch, st, solved, { rpm: 15, torque: 80, dir: 'CW' });
  eq('window + minTorque pass', r.pass, true);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
