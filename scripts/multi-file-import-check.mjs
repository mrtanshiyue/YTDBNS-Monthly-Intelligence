import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime = fs.readFileSync('public/multi-file-import.js', 'utf8');
const loader = fs.readFileSync('public/v44.js', 'utf8');
const legacy = fs.readFileSync('public/app.js', 'utf8');

assert.match(legacy, /roleMap\[role\]=\{file,parsed,rows\}/, 'baseline overwrite behavior changed; reassess overlay');
assert.match(runtime, /state\.records\.push\(\{ file, parsed, role, rows:/, 'must retain one validated record per physical file');
assert.match(runtime, /for \(let index = 0; index < state\.records\.length; index \+= 1\)/, 'commit must iterate all validated physical files');
assert.match(runtime, /form\.append\('file', record\.file\)/, 'each physical file must be uploaded');
assert.match(runtime, /mergeRoleRecords\(role, records\)/, 'same-role files must merge for structured normalization');
assert.match(runtime, /objects\.map\(object => unionHeaders\.map/, 'same-role merge must align rows by union header');
assert.match(runtime, /state\.records\.length !== state\.files\.length/, 'commit must fail closed when validated file count differs from selection');
assert.match(runtime, /本次源文件/, 'validation UI must expose physical file count');
assert.match(runtime, /全部将单独归档/, 'validation UI must state per-file archival');
assert.match(loader, /loadMultiFileImport\(\)/, 'v44 must load multi-file runtime');
assert.match(loader, /\.\/multi-file-import\.js/, 'multi-file runtime path missing');

console.log('True multi-file import static regression: PASS');
