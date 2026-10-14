const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(process.argv[2]||require('node:path').join(__dirname,'index.ts'),'utf8');
const config=code.slice(code.indexOf('const env='),code.indexOf('function claims')).replace('(name:string)','(name)');
const expected='https://ofgmcsmxmdswlovsckqs.supabase.co';
let passed=0;
function run(url,enabled='true',target='https://nlqynpmilcdqztwrrvyu.supabase.co'){
 const values={AQARI_RESTORE_SOURCE_URL:url,AQARI_STORAGE_RESTORE_V2_ENABLED:enabled,AQARI_RESTORE_SOURCE_PUBLIC_KEY:'synthetic-public-key',AQARI_RESTORE_WORKSPACE:'synthetic-workspace',AQARI_RESTORE_BUCKET:'aqari-documents',SUPABASE_URL:target};
 return vm.runInNewContext(config+';JSON.stringify({source,configurationIssues,reason:sourceUrlIssue()})',{URL,Deno:{env:{get:n=>values[n]}}});
}
for(const value of [expected,expected+'/', ' '+expected+'\n',' '+expected+'/\n']){
 const r=JSON.parse(run(value));assert.equal(r.source,expected);assert.deepEqual(r.configurationIssues,[]);passed++;
}
for(const value of ['',expected+'//',expected+'/auth',expected+'?x=1',expected+'#x',expected+'.evil.test','https://evil.test','http://ofgmcsmxmdswlovsckqs.supabase.co','https://user@ofgmcsmxmdswlovsckqs.supabase.co',expected.replace('ofgmcsmxmdswlovsckqs','nlqynpmilcdqztwrrvyu')]){
 assert(JSON.parse(run(value)).configurationIssues.includes('AQARI_RESTORE_SOURCE_URL'));passed++;
}
assert(JSON.parse(run(expected+'/','false')).configurationIssues.includes('AQARI_STORAGE_RESTORE_V2_ENABLED'));passed++;
assert(JSON.parse(run(expected,'true','https://wrong.supabase.co')).configurationIssues.includes('SUPABASE_URL'));passed++;
for(const [value,reason] of [[expected,null],['','missing'],['not a url','malformed_url'],['http://ofgmcsmxmdswlovsckqs.supabase.co','https_required'],['https://wrong.supabase.co','wrong_project'],[expected+'/auth','root_url_required'],['https://user@ofgmcsmxmdswlovsckqs.supabase.co','credentials_not_allowed'],['https://ofgmcsmxmdswlovsckqs.supabase.co:444','port_not_allowed']]){
 assert.equal(JSON.parse(run(value)).reason,reason);passed++;
}
console.log(JSON.stringify({passed,failed:0,scope:'local configuration evaluation only; no hosted transfer or login tested'}));
