// Confirms the inline UI-logic copy in index.html stays in sync with
// dev/logic.js — textually (the pure block is identical) and behaviorally
// (it passes the same unit tests). Run: node verify-logic.js
const fs = require('fs');
const path = require('path');
const { runTests } = require('./test-logic.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const logicSrc = fs.readFileSync(path.join(__dirname, 'logic.js'), 'utf8');

function between(src, a, b, where) {
  const i = src.indexOf(a), j = src.indexOf(b);
  if (i < 0 || j < 0) { console.error(`markers not found in ${where}`); process.exit(1); }
  return src.slice(i + a.length, j);
}

const inlineBlock = between(html, '// __PURE_BEGIN__', '// __PURE_END__', 'index.html');
const moduleBlock = between(logicSrc, '// __PURE_BEGIN__', '// __PURE_END__', 'logic.js');

// 1) Textual sync check (whitespace-normalized, so indentation/formatting of the
//    surrounding file cannot cause a false mismatch).
const norm = s => s.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length).join('\n');
let failed = 0;
if (norm(inlineBlock) === norm(moduleBlock)) {
  console.log('Inline logic block matches dev/logic.js.');
} else {
  failed++;
  console.log('MISMATCH: inline logic block in index.html differs from dev/logic.js.');
  const a = norm(inlineBlock).split('\n'), b = norm(moduleBlock).split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { console.log(`  first diff at line ${i + 1}:\n    inline: ${a[i]}\n    module: ${b[i]}`); break; }
  }
}

// 2) Behavioral check: evaluate the extracted inline block and run the suite.
const sandbox = {};
new Function('exports', inlineBlock + `
exports.GRAB_MIN=GRAB_MIN; exports.SNAP_TOLERANCE=SNAP_TOLERANCE; exports.slug=slug;
exports.buildExportName=buildExportName; exports.isGearAllowed=isGearAllowed; exports.grabRadius=grabRadius;
exports.overlapsSameLayer=overlapsSameLayer; exports.crossPlaneNearMesh=crossPlaneNearMesh;
exports.serializeProgress=serializeProgress; exports.mergeLoadedProgress=mergeLoadedProgress;
exports.gateStep=gateStep; exports.motorToLoadStages=motorToLoadStages;`)(sandbox);

failed += runTests(sandbox, 'inline copy');

process.exit(failed ? 1 : 0);
