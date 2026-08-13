// Unit tests for the pure UI-logic core (dev/logic.js). Dependency-free.
//   node test-logic.js
// verify-logic.js reuses runTests() against the inline copy in index.html.
const { pitchRadius, MESH_EPS } = require('./solver.js');

function runTests(L, label) {
  let passed = 0, failed = 0;
  const eq = (name, actual, expected) => {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) passed++;
    else { failed++; console.log(`  FAIL ${name}: got ${a}, expected ${e}`); }
  };

  // ---- slug / buildExportName (2.1) ----
  eq('slug spaces+punct', L.slug('Ada, Countess of Lovelace!'), 'Ada-Countess-of-Lovelace');
  eq('slug empty -> unnamed', L.slug('   '), 'unnamed');
  eq('slug trims edge dashes', L.slug('  --Bob--  '), 'Bob');
  eq('exportName sandbox', L.buildExportName({ student: 'Grace Hopper', mode: 'sandbox', challengeId: null, dateISO: '2026-08-13' }),
    'gear-train_Grace-Hopper_sandbox_2026-08-13');
  eq('exportName challenge', L.buildExportName({ student: '', mode: 'challenge', challengeId: '3.1', dateISO: '2026-08-13' }),
    'gear-train_unnamed_challenge-3.1_2026-08-13');
  eq('exportName sandbox mode ignores challengeId', L.buildExportName({ student: 'X', mode: 'sandbox', challengeId: '3.1', dateISO: '2026-01-01' }),
    'gear-train_X_sandbox_2026-01-01');

  // ---- isGearAllowed (2.2) ----
  const ch = { allowed: [12, 24] };
  eq('challenge allows listed', L.isGearAllowed(ch, 'challenge', 12), true);
  eq('challenge blocks unlisted', L.isGearAllowed(ch, 'challenge', 40), false);
  eq('sandbox allows anything', L.isGearAllowed(ch, 'sandbox', 40), true);
  eq('challenge w/o allowed list permits', L.isGearAllowed({}, 'challenge', 40), true);
  eq('no challenge permits', L.isGearAllowed(null, 'challenge', 40), true);

  // ---- geometry (2.5) ----
  eq('grab radius floored for 8T', L.grabRadius(8, pitchRadius), 24);         // pitchRadius(8)=18, +5=23 -> floored to 24
  eq('grab radius true for 40T', L.grabRadius(40, pitchRadius), pitchRadius(40) + 5); // 95
  eq('SNAP_TOLERANCE widened', L.SNAP_TOLERANCE, 24);

  const shaftById = id => ({ s1: { x: 0, y: 0 }, s2: { x: 60, y: 0 }, s3: { x: 81, y: 0 } }[id]);
  const gears = [
    { id: 'a', teeth: 12, shaftId: 's1', layer: 0 },
    { id: 'b', teeth: 24, shaftId: 's2', layer: 0 }, // 60px from s1: < 81 -> same-layer overlap
    { id: 'c', teeth: 24, shaftId: 's3', layer: 1 }  // 81px from s1 but OTHER plane -> cross-plane near-mesh
  ];
  const A = gears[0];
  eq('overlap detected same layer', !!L.overlapsSameLayer(A, { x: 0, y: 0 }, gears, shaftById, pitchRadius, MESH_EPS), true);
  eq('no overlap ignores other layer', L.overlapsSameLayer({ id: 'z', teeth: 12, shaftId: 'sz', layer: 1 }, { x: 0, y: 0 },
    [gears[0]], shaftById, pitchRadius, MESH_EPS), false);
  const xp = L.crossPlaneNearMesh(A, { x: 0, y: 0 }, gears, shaftById, pitchRadius, MESH_EPS);
  eq('cross-plane near mesh found', xp && xp.id, 'c');
  eq('cross-plane ignores same plane', L.crossPlaneNearMesh(A, { x: 0, y: 0 }, [gears[0], gears[1]], shaftById, pitchRadius, MESH_EPS), null);

  // ---- progress serialize / merge (1.4) ----
  eq('serializeProgress trims name', L.serializeProgress({ completed: { '1.1': true }, attempts: { '1.1': 2 }, attemptLog: {} }, '  Ada  '),
    { student: 'Ada', completed: { '1.1': true }, attempts: { '1.1': 2 }, attemptLog: {} });
  const cur = { completed: { '1.1': true }, attempts: { '1.1': 5 }, attemptLog: { '1.1': [{ n: 1 }] } };
  const file = { completed: { '2.1': true }, attempts: { '1.1': 3, '2.1': 4 }, attemptLog: { '2.1': [{ n: 1 }] } };
  const m = L.mergeLoadedProgress(cur, file);
  eq('merge unions completed', m.completed, { '1.1': true, '2.1': true });
  eq('merge keeps higher attempts (session 5 > file 3)', m.attempts['1.1'], 5);
  eq('merge takes file attempts where session has none', m.attempts['2.1'], 4);
  eq('merge keeps existing attemptLog', m.attemptLog['1.1'], [{ n: 1 }]);
  eq('merge adopts new attemptLog', m.attemptLog['2.1'], [{ n: 1 }]);
  eq('merge flag set', m.merged, true);
  eq('merge no file progress -> not merged, non-destructive', L.mergeLoadedProgress(cur, null).completed, { '1.1': true });
  eq('merge does not mutate current', cur.completed, { '1.1': true });

  // ---- reveal-gate state machine (1.1) ----
  let g = { revealed: false, resultShown: false };
  g = L.gateStep(g, 'OPEN_CHALLENGE'); eq('open -> hidden', g, { revealed: false, resultShown: false });
  g = L.gateStep(g, 'RUN'); eq('run -> revealed', g, { revealed: true, resultShown: true });
  g = L.gateStep(g, 'EDIT_PREDICTION'); eq('edit after run -> re-armed', g, { revealed: false, resultShown: false });
  g = L.gateStep(g, 'EDIT_PREDICTION'); eq('edit again -> still hidden (idempotent)', g, { revealed: false, resultShown: false });
  g = L.gateStep({ revealed: true, resultShown: true }, 'PREDICT_AGAIN'); eq('predict-again re-arms', g, { revealed: false, resultShown: false });
  g = L.gateStep({ revealed: true, resultShown: true }, 'RESET'); eq('reset re-arms', g, { revealed: false, resultShown: false });
  g = L.gateStep({ revealed: false, resultShown: false }, 'ENTER_SANDBOX'); eq('sandbox always revealed', g, { revealed: true, resultShown: false });

  // ---- motorToLoadStages (3.2) ----
  const reach = new Set(['s1', 's2', 's3']);
  const has = id => reach.has(id);
  // simple: s1(12) -- mesh -- s2(24)
  const st1 = L.motorToLoadStages(
    [{ id: 'a', teeth: 12, shaftId: 's1' }, { id: 'b', teeth: 24, shaftId: 's2' }],
    's1', 's2', [['a', 'b']], has);
  eq('simple: one stage', st1.length, 1);
  eq('simple: driver 12 driven 24', [st1[0].driver.teeth, st1[0].driven.teeth], [12, 24]);
  // compound: s1(12)->s2(24 + 12)->s3(24)
  const cg = [
    { id: 'a', teeth: 12, shaftId: 's1' }, { id: 'b', teeth: 24, shaftId: 's2' },
    { id: 'c', teeth: 12, shaftId: 's2' }, { id: 'd', teeth: 24, shaftId: 's3' }
  ];
  const st2 = L.motorToLoadStages(cg, 's1', 's3', [['a', 'b'], ['c', 'd']], has);
  eq('compound: two stages', st2.length, 2);
  eq('compound: stage2 driver rides s2', st2[1].driver.shaftId, 's2');
  eq('same shaft motor==load -> []', L.motorToLoadStages(cg, 's1', 's1', [], has), []);
  eq('unreachable load -> null', L.motorToLoadStages(cg, 's1', 's9', [['a', 'b']], has), null);

  const tag = label ? ` (${label})` : '';
  console.log(`${passed} passed, ${failed} failed${tag}`);
  return failed;
}

module.exports = { runTests };

if (require.main === module) {
  const L = require('./logic.js');
  process.exit(runTests(L) ? 1 : 0);
}
