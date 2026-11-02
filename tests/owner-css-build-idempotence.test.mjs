import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOwnerCssReference} from '../scripts/normalize-owner-css-reference.mjs';
for(const prefix of ['', 'globalThis.','globalThis.globalThis.','globalThis.globalThis.globalThis.'])test('CSS hardening is idempotent for '+(prefix||'bare CSS'),()=>{
 const value=normalizeOwnerCssReference(prefix+'CSS?.escape?.(name)');
 assert.equal(value,'globalThis.CSS?.escape?.(name)');
 assert.equal(normalizeOwnerCssReference(value),value);
});
test('unrelated object properties and longer identifiers remain unchanged',()=>{
 for(const value of ['theme.CSS?.escape?.(x)','myCSS?.escape?.(x)','globalThis.CSS.escape(x)'])assert.equal(normalizeOwnerCssReference(value),value);
});
