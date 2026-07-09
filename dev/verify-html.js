const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

// Extract inline solver (from const MODULE to just before CHALLENGE DEFINITIONS banner)
const start = html.indexOf('const MODULE = 4.5;');
const end = html.indexOf('/* =====================================================================\n   CHALLENGE DEFINITIONS');
if (start < 0 || end < 0) { console.error('markers not found'); process.exit(1); }
const solverSrc = html.slice(start, end);
const sandbox = {};
new Function('exports', solverSrc + '\nexports.solve=solve;exports.evaluateChallenge=evaluateChallenge;exports.pitchRadius=pitchRadius;exports.fmtNum=fmtNum;')(sandbox);

// Extract CHALLENGES array
const chStart = html.indexOf('const CHALLENGES = [');
const chEnd = html.indexOf('];', chStart) + 2;
const challengesSrc = html.slice(chStart, chEnd);
const chBox = {};
new Function('exports', challengesSrc + '\nexports.CHALLENGES=CHALLENGES;')(chBox);
const CHALLENGES = chBox.CHALLENGES;

const { solve, evaluateChallenge, pitchRadius } = sandbox;
let passed = 0, failed = 0;
function eq(name, actual, expected, eps = 0.01) {
  const ok = (typeof expected === 'number') ? Math.abs(actual - expected) <= eps : actual === expected;
  if (ok) { passed++; }
  else { failed++; console.log(`  FAIL ${name}: got ${actual}, expected ${expected}`); }
}
function mkTrain(gearSpecs) {
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

// Re-run core math assertions against the INLINE solver
{
  const st = mkTrain([[12],[24]]); st.motor={shaftId:'s0',rpm:120,torque:10}; st.load={shaftId:'s1'};
  const r = solve(st);
  eq('inline T1 rpm', r.out.rpm, 60); eq('inline T1 torque', r.out.torque, 20); eq('inline T1 dir', r.out.dir, 'CCW');
}
{
  const st = mkTrain([[10],[40,10],[30]]); st.motor={shaftId:'s0',rpm:120,torque:5}; st.load={shaftId:'s2'};
  const r = solve(st);
  eq('inline compound rpm', r.out.rpm, 10); eq('inline compound torque', r.out.torque, 60); eq('inline compound dir', r.out.dir, 'CW');
}

// Validate every challenge is achievable: build a reference solution per challenge and check pass
const solutions = {
  '1.1': { train: [[12],[24]] },
  '1.2': { train: [[40],[10]] },
  '2.1': { train: [[12],[20],[24]] },
  '2.2': { train: [[10],[16],[30]] },
  '3.1': { train: [[10],[40,10],[30]] },
  '3.2': { train: [[10],[40,10],[40]] },
  '4.1': { train: [[10],[40,12],[24]] }
};
console.log('Challenge validation:');
for (const ch of CHALLENGES) {
  const sol = solutions[ch.id];
  if (!sol) { console.log(`  SKIP ${ch.id} (no reference solution)`); continue; }
  const st = mkTrain(sol.train);
  st.motor = { shaftId: 's0', rpm: ch.motor.rpm, torque: ch.motor.torque };
  st.load = { shaftId: 's' + (sol.train.length - 1) };
  const solved = solve(st);
  if (!solved.out) { failed++; console.log(`  FAIL ${ch.id}: no output (${solved.error})`); continue; }
  // perfect prediction = actual values
  const pred = { rpm: solved.out.rpm, torque: solved.out.torque, dir: solved.out.dir };
  const ev = evaluateChallenge(ch, st, solved, pred);
  if (ev.pass) { passed++; console.log(`  PASS ${ch.id} ${ch.title}: out ${solved.out.rpm} RPM, ${Math.round(solved.out.torque*100)/100} N·cm, ${solved.out.dir}`); }
  else { failed++; console.log(`  FAIL ${ch.id} ${ch.title}: problems = ${JSON.stringify(ev.problems)} | out ${solved.out.rpm} RPM ${solved.out.torque} N·cm ${solved.out.dir}`); }
}

// Wrong-direction reference check for 2.1 (idler must be REQUIRED, not optional):
{
  const ch = CHALLENGES.find(c=>c.id==='2.1');
  const st = mkTrain([[12],[24]]); st.motor={shaftId:'s0',rpm:120,torque:10}; st.load={shaftId:'s1'};
  const solved = solve(st);
  const ev = evaluateChallenge(ch, st, solved, {rpm:60, torque:20, dir:'CCW'});
  eq('2.1 rejects no-idler build (dir + minGears)', ev.pass, false);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
