import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchMultiSourceProtectedHydration,MULTI_SOURCE_MARKER} from '../src/v267/support/multi-source-protected-hydration-patch.js';

const source=readFileSync(new URL('../v202-property-os.js',import.meta.url),'utf8');

test('protected hydration accepts multiple imported properties without weakening scope checks',()=>{
  const patched=patchMultiSourceProtectedHydration(source);
  assert.ok(patched.includes(MULTI_SOURCE_MARKER));
  assert.doesNotMatch(patched,/importedPropertyNames\.size!==1/);
  assert.match(patched,/if\(!importedPropertyNames\.size\)return denyProtectedHydration/);
  assert.match(patched,/const importedPropertyKeys=new Set\(importedPropertyNames\.keys\(\)\)/);
  assert.match(patched,/importedPropertyKeys\.has\(propertyKey\(record\.property\)\)/);
  assert.match(patched,/protectedPropertyNames=importedPropertyKeys/);
  assert.match(patched,/sameAccessScope\(currentScope,requestScope\)/);
  assert.match(patched,/normalized\(record\.source\)===V202_IMPORT_SOURCE/);
  new Function(patched);
});

test('property merging handles more than one protected property and stays idempotent',()=>{
  const once=patchMultiSourceProtectedHydration(source);
  assert.equal(patchMultiSourceProtectedHydration(once),once);
  assert.match(once,/if\(!allowed\.size\)return \{rows:result,changed\}/);
  assert.match(once,/for\(const candidateRow of remote\)/);
  assert.match(once,/if\(matches\.length!==1\)continue/);
  assert.doesNotMatch(once,/if\(allowed\.size!==1\)/);
});
