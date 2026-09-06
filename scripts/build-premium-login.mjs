import fs from 'node:fs';
import crypto from 'node:crypto';
// Deliberately preserve the reviewed authentication controller byte-for-byte.
const original=fs.readFileSync('login.html','utf8');
const auth=original.match(/<script>([\s\S]*?)<\/script>/)?.[0];
if(!auth)throw new Error('Existing authentication controller not found');
const digest=crypto.createHash('sha256').update(auth).digest('hex');
if(digest!=='fc0c29165898904d92d0303fb3d6901e4aa8de0052fdceb7ea34d069fb836361')throw new Error('Authentication controller changed; manual review required');
const template=fs.readFileSync('scripts/login-premium-shell.html','utf8');
if(template.split('<!--AQARI_EXISTING_AUTH-->').length!==2)throw new Error('Invalid login shell');
fs.writeFileSync('login.html',template.replace('<!--AQARI_EXISTING_AUTH-->',auth));
if(fs.existsSync('index.html')){
 let app=fs.readFileSync('index.html','utf8');
 const style='<style id="aqari-login-premium-gate">\n'+fs.readFileSync('scripts/login-premium-gate.css','utf8')+'\n</style>';
 const existing=/<style id="aqari-login-premium-gate">[\s\S]*?<\/style>/;
 if(existing.test(app))app=app.replace(existing,style);
 else{if(!app.includes('</head>'))throw new Error('App head missing');app=app.replace('</head>',style+'\n</head>');}
 fs.writeFileSync('index.html',app);
}
if(fs.existsSync('FILE_INVENTORY.json')){
 const inventory=JSON.parse(fs.readFileSync('FILE_INVENTORY.json','utf8'));
 for(const name of ['login.html','index.html','scripts/login-premium-gate.css','scripts/login-premium-shell.html','scripts/build-premium-login.mjs','tests/login-premium.e2e.mjs','.github/workflows/login-premium.yml']){
   if(!fs.existsSync(name))throw new Error('Missing '+name);
   const bytes=fs.readFileSync(name),entry={path:name,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
   const index=inventory.files.findIndex(item=>item.path===name);if(index<0)inventory.files.push(entry);else inventory.files[index]=entry;
 }
 fs.writeFileSync('FILE_INVENTORY.json',JSON.stringify(inventory,null,2)+'\n');
}
console.log('Premium login generated; original authentication SHA256 preserved:',digest);
