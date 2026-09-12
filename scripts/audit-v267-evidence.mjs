// Read-only source audit. A linked file or passing unit test never closes a
// business acceptance gate. This command accepts no service credentials or URLs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export function parseMatrix(text){
 const evidence=new Map(),requirements=[];
 for(const line of text.split('\n')){
  const cells=line.split('|').slice(1,-1).map(x=>x.trim());
  if(/^E\d{2}$/.test(cells[0]||'')){if(evidence.has(cells[0]))throw Error('DUPLICATE_EVIDENCE');evidence.set(cells[0],cells[1]);}
  if(/^\d+$/.test(cells[0]||''))requirements.push({id:Number(cells[0]),sourceId:cells[1],requirement:cells[2],reportedImplementation:cells[3],acceptanceRemaining:cells[4]});
 }
 if(requirements.length!==155||requirements.some((x,i)=>x.id!==i+1)||new Set(requirements.map(x=>x.sourceId)).size!==155)throw Error('EXPECTED_155_UNIQUE_ORDERED_REQUIREMENTS');
 for(const r of requirements){
  const expanded=r.reportedImplementation.replace(/E(\d{2})[–—-]E(\d{2})/g,(_,a,b)=>Array.from({length:Number(b)-Number(a)+1},(_,i)=>'E'+String(Number(a)+i).padStart(2,'0')).join(' '));
  r.evidenceIds=[...new Set(expanded.match(/E\d{2}/g)||[])];
  for(const id of r.evidenceIds)if(!evidence.has(id))throw Error('UNKNOWN_EVIDENCE:'+id);
 }
 return {requirements,evidence};
}

export function audit(root){
 const matrixPath='docs/V267-REQUIREMENTS-155.md',matrix=fs.readFileSync(path.join(root,matrixPath),'utf8');
 const parsed=parseMatrix(matrix),fileCache=new Map(),evidence={};
 const hash=value=>createHash('sha256').update(value).digest('hex');
 for(const [id,text]of parsed.evidence){
  const files=[];
  for(const m of text.matchAll(/\]\(([^)]+)\)/g)){
   if(/^[a-z]+:/i.test(m[1]))continue;
   const resolved=path.resolve(root,'docs',m[1].split('#')[0]),relative=path.relative(root,resolved).split(path.sep).join('/');
   if(relative.startsWith('../')||path.isAbsolute(relative))throw Error('EVIDENCE_OUTSIDE_REPOSITORY');
   if(!fileCache.has(relative)){
    if(!fs.existsSync(resolved))throw Error('MISSING_EVIDENCE_FILE:'+relative);
    const bytes=fs.readFileSync(resolved),source=bytes.toString('utf8');
    fileCache.set(relative,{path:relative,sha256:hash(bytes),bytes:bytes.length,
     declaredTables:[...new Set([...source.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?((?:public|private)\.[a-z_0-9]+)/gi)].map(x=>x[1]))],
     publicFunctions:[...new Set([...source.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(public\.[a-z_0-9]+)/gi)].map(x=>x[1]))],
     clientRpcCalls:[...new Set([...source.matchAll(/\.rpc\(\s*['"]([^'"]+)/g)].map(x=>x[1]))],
     testKind:/\/tests\/.+\.sql$/.test('/'+relative)?'database-suite':/^tests\/.*\.e2e\./.test(relative)?'browser-suite':/^tests\//.test(relative)?'local-test':null});
   }
   files.push(relative);
  }
  evidence[id]={files};
 }
 const requirements=parsed.requirements.map(r=>{
  const files=[...new Set(r.evidenceIds.flatMap(id=>evidence[id].files))];
  const needs=[];const description=r.requirement+' '+r.acceptanceRemaining;
  if(files.some(p=>p.endsWith('.sql')))needs.push('hosted-database-acceptance');
  if(/آيفون|آيباد|iPhone|iPad|جهاز|شبكات الهاتف|ثانيتين/.test(description))needs.push('physical-device-or-network-measurement');
  if(/نسخ.*احتياط|استعاد|رجوع|جغراف|تعاف/.test(description))needs.push('backup-bytes-and-isolated-restore');
  if(/K-Net|WhatsApp|واتساب|Push|SMS|OAuth|Zoho|Xero|QuickBooks|مزود|تشفير/.test(description))needs.push('provider-configuration-or-evidence');
  if(/مراجعة مختص|اعتماد قانوني|مراجعة قانونية|محاسبي شامل/.test(description))needs.push('independent-professional-review');
  return {...r,evidenceFiles:files,uiFiles:files.filter(p=>p.startsWith('src/')||/^v\d+.*\.js$/.test(p)),sqlFiles:files.filter(p=>p.endsWith('.sql')&&!p.includes('/tests/')),testFiles:files.filter(p=>fileCache.get(p).testKind),requiredVerification:needs,
   fullAcceptance:'NOT_PROVEN',productionCompletion:'NOT_PROVEN'};
 });
 return {schemaVersion:1,sourceParentSHA:'79f91be5b263212a853a7a1c64475e73b116201d',matrixSha256:hash(matrix),releaseGate:'HOLD',releasePolicy:{all155RequiredBeforeRelease:true,required:['all-155-requirements-accepted','authenticated-live-acceptance','iphone-ipad-desktop-acceptance','data-integrity','tested-database-auth-and-attachment-backup','isolated-restore','tested-V266-rollback'],authorizationAlreadyGranted:true,evidenceReport:'docs/V267-FULL-RELEASE-GATE-2026-09-12.md'},method:'References and declarations extracted from the 155-row source matrix; association is not proof of complete implementation or database execution. See the execution report for tests actually run.',evidence,files:[...fileCache.values()],requirements};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const result=audit(root);
 if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,'docs/V267-EVIDENCE-155.json'),JSON.stringify(result,null,2)+'\n');
 const statuses={};for(const r of result.requirements){const label=r.reportedImplementation.split(' — ')[0];statuses[label]=(statuses[label]||0)+1;}
 console.log(JSON.stringify({requirements:result.requirements.length,evidence:Object.keys(result.evidence).length,files:result.files.length,statuses,releaseGate:result.releaseGate}));
}
