import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';

const result=spawnSync(process.execPath,['scripts/build-vercel-full.mjs'],{encoding:'utf8',maxBuffer:50*1024*1024});
const report=['status='+String(result.status),'signal='+String(result.signal),'--- stdout ---',result.stdout||'','--- stderr ---',result.stderr||''].join('\n');
writeFileSync(new URL('../build-diagnostic.txt',import.meta.url),report);
if(result.status===0)console.log('Full build passed.');
else console.error('Full build failed; diagnostic artifact created for this preview only.');
