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
test('approved contact information is linked natively without prefilling account credentials',()=>{
 for(const number of ['50721277','51119040','55521007','25640025'])assert.ok(html.includes('href="tel:+965'+number+'"'),number);
 assert.ok(html.includes('href="mailto:myaqari.kw@gmail.com"'));
 for(const text of ['الكويت','السالمية','قطعة 10','شارع عيسى القطامي','بناية 28'])assert.ok(html.includes(text),text);
 const email=html.match(/<input\b[^>]*\bid="email"[^>]*>/)?.[0];assert.ok(email);
 assert.doesNotMatch(email,/\bvalue\s*=/);
 assert.doesNotMatch(html,/dhahawikw\.com|dhahawitower@gmail\.com/i);
});
test('the approved facade is a small non-blocking decorative asset, not the functional interface',()=>{
 const photo=fs.readFileSync(path.join(root,'assets/approved-property.avif'));
 assert.equal(photo.subarray(4,12).toString('ascii'),'ftypavif');
 assert.equal(crypto.createHash('sha256').update(photo).digest('hex'),'398283c4f151d927001d5b1c05083cc71794a6dba4fb10c5120c578332c92094');
 assert.ok(photo.length<12000);
 assert.ok(html.includes("url('/assets/approved-property.avif')"));
 assert.ok(html.includes('.story:before{background-image:none}'));
 assert.match(html,/<form id="loginForm"/);
});
test('visual approval does not invent enabled login methods or operational guarantees',()=>{
 const presentation=html.slice(0,html.indexOf('<script>'));
 assert.doesNotMatch(presentation,/الدخول عبر رقم الهاتف|البصمة|24\s*\/\s*7|إنشاء حساب جديد|بياناتك آمنة دائماً/);
 assert.equal((presentation.match(/type="submit"/g)||[]).length,1);
 assert.match(presentation,/id="status"[^>]*role="status"[^>]*aria-live="polite"/);
});
