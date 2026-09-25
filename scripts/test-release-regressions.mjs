// Test the prepared application in a disposable copy; keep the checkout pristine.
import {cpSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const requested=process.argv.slice(2);
const tests=requested.length?requested:readdirSync(join(root,'tests'))
 .filter(name=>/\.test\.(?:cjs|mjs)$/.test(name)).sort().map(name=>'tests/'+name);
if(!tests.length||tests.some(name=>!/^tests\/[^/\\]+\.test\.(?:cjs|mjs)$/.test(name)))
 throw Error('Expected one or more existing release test files.');
const temporary=mkdtempSync(join(tmpdir(),'aqari-release-regressions-'));
const prepared=join(temporary,'source');
const excluded=new Set(['.git','node_modules','__pycache__','.venv']);
try{
 cpSync(root,prepared,{recursive:true,filter:source=>
  !relative(root,source).split(sep).some(part=>excluded.has(part))});
 const run=args=>{
  const result=spawnSync(process.execPath,args,{cwd:prepared,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('Release regression command failed: '+args.join(' ')+
   ' (exit '+result.status+', signal '+result.signal+')');
 };
 // These are the same bounded, local file transformations used by the Vercel build.
 // The ownership installer also installs and verifies the final navigation repair.
 run(['scripts/sync-unified-styles.mjs']);
 run(['scripts/install-v267-property-ownership.mjs']);
 run(['--test','--test-concurrency=4',...tests]);
}finally{
 rmSync(temporary,{recursive:true,force:true});
}
