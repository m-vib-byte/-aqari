import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const PREVIEW_PROJECT = 'ofgmcsmxmdswlovsckqs';
export const PRODUCTION_PROJECT = 'djkpkkgoibruaezdrchb';
export const PRODUCTION_REDIRECT = 'https://myaqari.com/login.html?release=V267';
export const DOMAIN_TRIAL_REDIRECT = PRODUCTION_REDIRECT;
const previewHost = 'aqari-git-design-v267-premium-workspace-m-vib-5421.vercel.app';
const runtimeReferences = {
  'cloud-sync.js':1,'final-release-ui.js':1,'v205-simplified-shell.js':1,
  'v267-rental-records.js':1,'v267-tenant-portal.js':1,
  'v267-partner-portal.js':1,'v267-reset-password.js':1,
  'src/v267/api/session.js':2
};

function replaceExact(source,from,to,count,path){
  if(source.split(from).length-1!==count)throw Error('PRODUCTION_SOURCE_CHANGED: '+path);
  return source.split(from).join(to);
}
function replaceTrialExact(source,from,to,path){
  const sourceCount=source.split(from).length-1,targetCount=source.split(to).length-1;
  if(sourceCount===1&&targetCount===0)return source.split(from).join(to);
  if(sourceCount===0&&targetCount===1)return source;
  throw Error('DOMAIN_TRIAL_SOURCE_CHANGED: '+path);
}

function browserConfig(read){
  const context={window:{}};
  runInNewContext(read('public-config.js'),context,{timeout:1000});
  return context.window.AQARI_PUBLIC_CONFIG;
}

function patchInventory(read,patch){
  const inventory=JSON.parse(read('FILE_INVENTORY.json'));
  for(const [path,content] of patch){
    const row=inventory.files.find(row=>row.path===path);
    if(!row)throw Error('INVENTORY_ENTRY_REQUIRED: '+path);
    row.size=Buffer.byteLength(content);row.sha256=createHash('sha256').update(content).digest('hex');
  }
  patch.set('FILE_INVENTORY.json',JSON.stringify(inventory,null,2)+'\n');
  return patch;
}

// Single-domain trial mode intentionally keeps the isolated V267 Supabase project.
// It changes only the browser return host so myaqari.com can be the sole test URL.
// Production data, migrations, memberships, storage and records are never touched.
export function domainTrialPatch(read,{enabled,hostname,projectRef,publishableKey}){
  if(enabled!==true||hostname!=='myaqari.com')throw Error('DOMAIN_TRIAL_TARGET_REQUIRED');
  if(projectRef!==PREVIEW_PROJECT)throw Error('ISOLATED_TRIAL_PROJECT_REQUIRED');
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(String(publishableKey)))throw Error('PUBLISHABLE_KEY_REQUIRED');
  const original=browserConfig(read);
  if(original?.productVersion!=='V267'||original.releaseStage!=='preview'||
     original.supabaseUrl!==`https://${PREVIEW_PROJECT}.supabase.co`||
     original.supabaseAuthStorageKey!==`sb-${PREVIEW_PROJECT}-auth-token`)throw Error('ISOLATED_SOURCE_REQUIRED');
  const patch=new Map();
  const browser={...original,supabaseAuthRedirectUrl:DOMAIN_TRIAL_REDIRECT,
    supabaseUrl:`https://${PREVIEW_PROJECT}.supabase.co`,supabasePublishableKey:publishableKey,
    supabaseAuthStorageKey:`sb-${PREVIEW_PROJECT}-auth-token`};
  patch.set('public-config.js','window.AQARI_PUBLIC_CONFIG = Object.freeze('+JSON.stringify(browser,null,2)+');\n');
  const adapter=replaceTrialExact(read('supabase-adapter.js'),"target.hostname !== '"+previewHost+"'","target.hostname !== 'myaqari.com'",'supabase-adapter.js');
  patch.set('supabase-adapter.js',adapter);
  const partner=replaceTrialExact(read('v267-partner-portal.js'),'https://'+previewHost+'/login.html?release=V267',DOMAIN_TRIAL_REDIRECT,'v267-partner-portal.js');
  patch.set('v267-partner-portal.js',partner);
  return patchInventory(read,patch);
}

// Pure source preparation for a formally approved production data release.
// The isolated source, SQL, hosted data, memberships, permissions and feature-discovery response are never changed by this function.
export function productionPatch(read,{projectRef,publishableKey}){
  if(projectRef!==PRODUCTION_PROJECT)throw Error('CURRENT_PRODUCTION_PROJECT_REQUIRED');
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(String(publishableKey)))throw Error('PUBLISHABLE_KEY_REQUIRED');
  const original=browserConfig(read);
  if(original?.productVersion!=='V267'||original.releaseStage!=='preview'||
     original.supabaseUrl!==`https://${PREVIEW_PROJECT}.supabase.co`||
     original.supabaseAuthStorageKey!==`sb-${PREVIEW_PROJECT}-auth-token`)throw Error('ISOLATED_SOURCE_REQUIRED');
  const patch=new Map();
  for(const [path,count] of Object.entries(runtimeReferences)){
    let source=replaceExact(read(path),PREVIEW_PROJECT,PRODUCTION_PROJECT,count,path);
    if(path==='v267-tenant-portal.js'||path==='v267-partner-portal.js'){
      source=replaceExact(source,"cfg.releaseStage!=='preview'","cfg.releaseStage!=='production'",1,path);
    }
    if(path==='v267-partner-portal.js'){
      source=replaceExact(source,'https://'+previewHost+'/login.html?release=V267',PRODUCTION_REDIRECT,1,path);
    }
    if(path==='v267-reset-password.js'){
      source=replaceExact(source,"cfg?.releaseStage!=='preview'","cfg?.releaseStage!=='production'",1,path);
    }
    patch.set(path,source);
  }
  let adapter=replaceExact(read('supabase-adapter.js'),"target.hostname !== '"+previewHost+"'","target.hostname !== 'myaqari.com'",1,'supabase-adapter.js');
  adapter=replaceExact(adapter,'AQARI_STAGING_REDIRECT_INVALID','AQARI_PRODUCTION_REDIRECT_INVALID',1,'supabase-adapter.js');
  patch.set('supabase-adapter.js',adapter);
  const browser={...original,releaseStage:'production',supabaseUrl:`https://${PRODUCTION_PROJECT}.supabase.co`,
    supabasePublishableKey:publishableKey,supabaseAuthStorageKey:`sb-${PRODUCTION_PROJECT}-auth-token`,
    supabaseAuthRedirectUrl:PRODUCTION_REDIRECT};
  patch.set('public-config.js','window.AQARI_PUBLIC_CONFIG = Object.freeze('+JSON.stringify(browser,null,2)+');\n');
  let backend=replaceExact(read('lib/release-config.js'),PREVIEW_PROJECT,PRODUCTION_PROJECT,1,'lib/release-config.js');
  backend=replaceExact(backend,"export const RELEASE_STAGE = 'preview'","export const RELEASE_STAGE = 'production'",1,'lib/release-config.js');
  backend=replaceExact(backend,"publishableKey: '"+original.supabasePublishableKey+"'","publishableKey: '"+publishableKey+"'",1,'lib/release-config.js');
  patch.set('lib/release-config.js',backend);
  // The current backend does not accept preferredContact in an imported-tenant
  // patch, or the new supporting_document kind. Keep completed edits usable
  // without exposing those unimplemented parts or changing existing records.
  const editorPath='src/v267/pages/imported-tenant.js';
  let editor=replaceExact(read(editorPath),"const preferredContact=node('select');for(const [value,label]of contactOptions()){const option=node('option',label);option.value=value;preferredContact.append(option);}inputs.preferredContact=preferredContact;body.append(field(translateStatic('وسيلة التواصل المفضلة'),preferredContact));","const preferredContact={value:'both'};",1,editorPath);
  editor=replaceExact(editor,'patch.preferredContact=preferredContact.value;','',1,editorPath);
  patch.set(editorPath,editor);
  const workspacePath='src/v267/workspace.js';
  patch.set(workspacePath,replaceExact(read(workspacePath),'tools.append(staffCirculars,readinessButton,staffAccess,financialRegister,openingBalances,partnerDistributions,commercialCollections,financialArchiveButton,deposits,finalGapButton,officialDocumentsButton,integrationsButton,guideButton,complianceButton,kpiButton,maintenancePlansButton,maintenanceReportButton,securityCenter,operationsCenter,originals,exitReview,vacating,vacatingReview);','originals.hidden=true;originals.disabled=true;\n tools.append(staffCirculars,readinessButton,staffAccess,financialRegister,openingBalances,partnerDistributions,commercialCollections,financialArchiveButton,deposits,finalGapButton,officialDocumentsButton,integrationsButton,guideButton,complianceButton,kpiButton,maintenancePlansButton,maintenanceReportButton,securityCenter,operationsCenter,originals,exitReview,vacating,vacatingReview);',1,workspacePath));
  const documentsPath='src/v267/pages/original-documents.js';
  patch.set(documentsPath,replaceExact(read(documentsPath),'export function openOriginalDocuments(){',"export function openOriginalDocuments(){\n throw Error('هذه الخدمة قيد التجهيز لهذه النسخة.');",1,documentsPath));
  return patchInventory(read,patch);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [output,projectRef,publishableKey]=process.argv.slice(2);
  if(!output||!projectRef||!publishableKey)throw Error('Usage: node scripts/prepare-v267-production.mjs NEW_OUTPUT_DIRECTORY CURRENT_PROJECT_REF PUBLISHABLE_KEY');
  const target=resolve(output),root=resolve('.');
  if(existsSync(target)||target===root||root.startsWith(target+'/'))throw Error('NEW_INDEPENDENT_OUTPUT_DIRECTORY_REQUIRED');
  const paths=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
  const patch=productionPatch(path=>readFileSync(path,'utf8'),{projectRef,publishableKey});
  // Prepare every changed file before writing anything. No commands, credentials,
  // network requests or migrations are invoked against the current data source.
  mkdirSync(target,{recursive:true});
  for(const path of paths){const destination=resolve(target,path);if(!destination.startsWith(target+'/'))throw Error('INVALID_SOURCE_PATH');
    mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,patch.has(path)?patch.get(path):readFileSync(path));}
  for(const [path,content] of patch){const destination=resolve(target,path);mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,content);}
  console.log('Prepared production source in '+target+'. Not deployed. Validate before release.');
}
