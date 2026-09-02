import { spawnSync } from 'node:child_process';

const steps = [
  ['package', ['node', 'scripts/check.mjs']],
  ['environment', ['node', 'scripts/preflight-env.mjs']]
];

let failed = false;

for (const [name, cmd] of steps) {
  const [bin, ...args] = cmd;
  const r = spawnSync(bin, args, { stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error(`Deploy gate failed at: ${name}`);
    failed = true;
    break;
  }
}

if (failed) process.exit(1);
console.log('AQARI V198 deploy readiness: PASS');
