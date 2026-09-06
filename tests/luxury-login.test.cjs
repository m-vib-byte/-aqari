'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'login.html'),'utf8'),ui=fs.readFileSync(path.join(root,'login-luxury.js'),'utf8');
test('the redesign keeps the exact existing authentication kernel',()=>{
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,1);
 assert.equal(crypto.createHash('sha256').update(scripts[0][1]).digest('hex'),'22c71f844b4eedd8954a938d8ffe506fc7953d8a2021b714959eb43d46e1a7ef');
});
test('the complete login form and critical styles are rendered without scripts',()=>{
 for(const id of ['luxuryLogin','loginForm','email','password','loginButton','status','retryButton','recoveryButton'])assert.ok(html.indexOf('id="'+id+'"')<html.indexOf('<script>'));
 assert.match(html,/<style>/);assert.doesNotMatch(html,/<link[^>]+rel="stylesheet"/);assert.doesNotMatch(html,/@font-face|<img\b|<iframe\b/);
 assert.ok(Buffer.byteLength(html)<30000);
});
test('presentation features cannot unlock data or persist credentials',()=>{
 assert.doesNotMatch(ui,/localStorage|sessionStorage|\.signIn\(|\.signOut\(|\.getSession\(|activateWorkspace|aqari-auth-unlocked|location\.replace|\.fetch\(/);
 assert.match(ui,/aria-pressed/);assert.match(ui,/getModifierState/);assert.match(ui,/prefers-reduced-motion/);assert.match(ui,/navigator\.onLine/);
});
test('nonessential design script is deferred and preserves native password-manager fields',()=>{
 assert.match(html,/<script src="\/login-luxury\.js\?design=L1" defer><\/script>/);
 assert.match(html,/autocomplete="username"/);assert.match(html,/autocomplete="current-password"/);assert.match(html,/id="passwordToggle"[^>]*hidden/);
});
