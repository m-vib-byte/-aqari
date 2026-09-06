'use strict';
// Deterministic presentation build. No network calls, credentials, or database access.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const file=name=>path.join(root,name);
const read=name=>fs.readFileSync(file(name),'utf8');
const write=(name,value)=>fs.writeFileSync(file(name),value);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const gitBlob=value=>crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+Buffer.byteLength(value)+'\0'),Buffer.from(value)])).digest('hex');
const source=read('login.html');
const scripts=[...source.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length,1,'The login auth boundary must have exactly one inline kernel');
assert.equal(digest(scripts[0][1]),'22c71f844b4eedd8954a938d8ffe506fc7953d8a2021b714959eb43d46e1a7ef','Authentication changed: review before rebuilding the presentation');
const shell=read('design/login-luxury-shell.html');
assert.equal(shell.split('<!--AUTH_RUNTIME-->').length,2);
const html=shell.replace('<!--AUTH_RUNTIME-->','<script>'+scripts[0][1]+'</script>');
assert.equal([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],scripts[0][1]);
assert.ok(Buffer.byteLength(html)<30000,'Inline critical presentation must stay under 30 KB');
write('login.html',html);
let ui=read('v199-ui.js');
if(!ui.includes("luxury.id='aqari-login-luxury-js'")){
 assert.equal(gitBlob(ui),'2bfbbc59ec7f01ab103d48a1bf05b25bf535fcf9','Presentation loader changed: review required');
 const old='    focusGate();\n  }\n\n  function dashboardMarkup(){';
 assert.equal(ui.split(old).length,2);
 ui=ui.replace(old,`    focusGate();
    // Non-blocking presentation enhancement. Authentication never awaits it.
    if(!document.getElementById('aqari-login-luxury-js')){
      const luxury=document.createElement('script');
      luxury.id='aqari-login-luxury-js';
      luxury.src='/login-luxury.js?design=L1';
      luxury.async=true;
      document.head.appendChild(luxury);
    }
  }

  function dashboardMarkup(){`);
 write('v199-ui.js',ui);
}
const testPath='tests/mobile-login-shell.test.cjs';
let test=read(testPath);
const oldBudget="Buffer.byteLength(html) < 17_000, 'login plus automatic session restoration should stay under 17 KB'";
const newBudget="Buffer.byteLength(html) < 30_000, 'inline luxury layout and unchanged auth must stay under 30 KB without font or image requests'";
assert.ok(test.includes(oldBudget)||test.includes(newBudget));
write(testPath,test.replace(oldBudget,newBudget));
const inventory=JSON.parse(read('FILE_INVENTORY.json'));
const entries=new Map(inventory.files.map(item=>[item.path,item]));
for(const name of ['login.html','v199-ui.js','login-luxury.js','vercel.json','scripts/build-login-luxury.cjs','design/login-luxury-shell.html','tests/mobile-login-shell.test.cjs','tests/luxury-login.test.cjs','tests/luxury-login.e2e.mjs','.github/workflows/luxury-login.yml']){
 const data=fs.readFileSync(file(name));
 const item={path:name,size:data.length,sha256:digest(data)};
 if(entries.has(name))Object.assign(entries.get(name),item);else inventory.files.push(item);
}
write('FILE_INVENTORY.json',JSON.stringify(inventory,null,2)+'\n');
console.log('Login L1 built:',Buffer.byteLength(html),'bytes. Authentication kernel byte-identical; no account or business-data changes.');
