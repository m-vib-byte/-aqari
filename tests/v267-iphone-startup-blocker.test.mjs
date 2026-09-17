import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const runtime=readFileSync(new URL('../src/v267/unified-layout-runtime.js',import.meta.url),'utf8');
const login=readFileSync(new URL('../login.html',import.meta.url),'utf8');

test('dashboard observer ignores its own rendered mutations instead of refreshing forever',()=>{
 assert.doesNotMatch(runtime,/MutationObserver\(\(\)=>\{applyGlobalPageClasses\(\);refreshDashboard\(\);mountDesktopNav\(\);\}\)/);
 assert.match(runtime,/let dashboardRefreshQueued=false/);
 assert.match(runtime,/const externalMutation=records\.some/);
 assert.match(runtime,/target\?\.closest\?\.\('\#'\+ROOT_ID\)/);
 assert.match(runtime,/requestAnimationFrame\(\(\)=>\{[\s\S]*refreshDashboard\(\)/);
});

test('login retires legacy worker and caches before warming auth dependencies',()=>{
 assert.doesNotMatch(login,/retireLegacyReleaseState\(\);warmCore\(\)/);
 const retire=login.indexOf('retireLegacyReleaseState().then(function()');
 const warm=login.indexOf('warmCore();',retire);
 assert.ok(retire>=0&&warm>retire);
});

test('a still-controlled iPhone tab receives one bounded reload after unregister',()=>{
 assert.match(login,/var resetKey='__aqari_sw_retired_v267'/);
 assert.match(login,/navigator\.serviceWorker\.controller/);
 assert.match(login,/sessionStorage\.getItem\(resetKey\)!=='1'/);
 assert.match(login,/sessionStorage\.setItem\(resetKey,'1'\)/);
 assert.match(login,/window\.location\.reload\(\)/);
 assert.match(login,/sessionStorage\.removeItem\(resetKey\)/);
});
