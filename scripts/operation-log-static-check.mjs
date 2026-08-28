import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const required = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`Missing ${label}: ${token}`);
};

const workerEntry = read('src/worker-entry.js');
const service = read('src/operation-log.js');
const migration = read('migrations/0005_operation_logs.sql');
const ui = read('public/operation-log.js');
const css = read('public/operation-log.css');
const loader = read('public/v44.js');

required(migration, 'CREATE TABLE IF NOT EXISTS operation_logs', 'operation log table');
required(service, 'operationLogsResponse', 'operation log read API');
required(service, 'appendOperationLog', 'operation log writer');
required(workerEntry, "'/api/operation-logs'", 'operation log route');
required(workerEntry, "'IMPORT_STARTED'", 'import start event');
required(workerEntry, "'FILE_STORED'", 'file stored event');
required(workerEntry, "'IMPORT_COMMITTED'", 'import committed event');
required(workerEntry, "'IMPORT_COMMIT_FAILED'", 'import failed event');
required(workerEntry, 'payloadCounts(payload)', 'structured write counts');
required(ui, "id = 'operationLogBtn'", 'top-right operation log button');
required(ui, '查看完整导入明细', 'detailed log disclosure');
required(ui, 'America/Los_Angeles', 'operation log timezone');
required(css, '.operation-log-drawer', 'operation log drawer styles');
required(loader, "link.href='./operation-log.css'", 'operation log stylesheet loader');
required(loader, "script.src='./operation-log.js'", 'operation log runtime loader');

console.log('Operation log static acceptance: PASS');
