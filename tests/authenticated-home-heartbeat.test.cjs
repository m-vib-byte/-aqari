const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual init callback without scheduling its first interval tick.
// A fast authenticated renderer can sample the heartbeat in this window.
const source = fs.readFileSync(path.join(__dirname, 'v266-authenticated-home.e2e.mjs'), 'utf8');
const startMarker = 'await context.addInitScript(value=>{';
const endMarker = '},session);';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
assert.ok(start >= 0 && end > start, 'authenticated init callback must be present');
const initBody = source.slice(start + startMarker.length, end);

function initialize() {
  const intervals = [];
  const context = {
    window: {},
    localStorage: {setItem() {}},
    Node: {prototype: {appendChild(node) { return node; }}},
    setInterval(callback, ms) { intervals.push({callback, ms}); return intervals.length; },
    value: {access_token: 'synthetic-only'}
  };
  vm.runInNewContext(initBody, context);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].ms, 100);
  return {window: context.window, tick: intervals[0].callback};
}

test('heartbeat has a numeric baseline before the first browser timer fires', () => {
  const {window, tick} = initialize();
  const baseline = window.__homeHeartbeats;
  assert.equal(baseline, 0);
  tick();
  assert.equal(window.__homeHeartbeats, 1);
  assert.ok(window.__homeHeartbeats > baseline, 'an early baseline must not yield a false frozen-UI failure');
  tick();
  assert.equal(window.__homeHeartbeats, 2);
});

test('a stopped heartbeat still fails the unchanged responsiveness comparison', () => {
  const {window, tick} = initialize();
  const baseline = window.__homeHeartbeats;
  assert.equal(window.__homeHeartbeats > baseline, false);
  tick();
  const stoppedAt = window.__homeHeartbeats;
  assert.equal(window.__homeHeartbeats > stoppedAt, false);
  assert.match(source, /await delay\(1000\);\s*assert\.ok\(await page\.evaluate\(\(\)=>window\.__homeHeartbeats\)>beats/,
    'keep the existing one-second responsiveness assertion');
});
