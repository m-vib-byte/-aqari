import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const isPreview=process.env.VERCEL_ENV==='preview';
const sha=String(process.env.VERCEL_GIT_COMMIT_SHA||'').trim().toLowerCase();
const branchHost=String(process.env.VERCEL_BRANCH_URL||'aqari-git-support-v267-knet-range-reconcile-20260915-m-vib-5421.vercel.app').trim().toLowerCase();
const immutableHost=String(process.env.VERCEL_URL||'').trim().toLowerCase();
const escapeRegExp=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function source(path){return readFileSync(new URL('../'+path,import.meta.url),'utf8')}

test('deployed Preview files are pinned after the final build-time rewrite', {skip:!isPreview}, ()=>{
  assert.match(sha,/^[0-9a-f]{40}$/,'preview SHA');
  assert.match(branchHost,/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/,'branch host');
  assert.match(immutableHost,/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/,'immutable host');

  const config=source('public-config.js');
  assert.match(config,new RegExp(`"previewCandidateSha": "${escapeRegExp(sha)}"`));
  assert.match(config,new RegExp(`"previewBranchHost": "${escapeRegExp(branchHost)}"`));
  assert.match(config,new RegExp(`"previewImmutableHost": "${escapeRegExp(immutableHost)}"`));
  assert.match(config,new RegExp(`https://${escapeRegExp(branchHost)}/login\\.html\\?release=V267`));

  const login=source('login.html');
  assert.match(login,/function aqariReturnTarget\(\)/);
  assert.match(login,/qa-b-reauth-v2\\\.html/);
  assert.match(login,/previewCandidateSha/);
  assert.equal((login.match(/window\.location\.replace\(aqariReturnTarget\(\)\);/g)||[]).length,2);

  const runner=source('qa-b.html');
  assert.match(runner,new RegExp(`const CANDIDATE_SHA='${escapeRegExp(sha)}';`));
  assert.match(runner,new RegExp(`const BRANCH_HOST='${escapeRegExp(branchHost)}';`));
  assert.equal((runner.match(/X-AQARI-Candidate-Sha/g)||[]).length,2);
  assert.match(runner,/requestedCandidate===CANDIDATE_SHA/);
  assert.match(runner,/saved\?\.candidate_sha===CANDIDATE_SHA/);

  const reauth=source('qa-b-reauth-v2.html');
  assert.match(reauth,new RegExp(`const CANDIDATE_SHA='${escapeRegExp(sha)}';`));
  assert.match(reauth,new RegExp(`const BRANCH_HOST='${escapeRegExp(branchHost)}';`));
  assert.match(reauth,/requestedCandidate!==CANDIDATE_SHA/);
  assert.match(reauth,/SESSION_LOGIN_REDIRECT/);
  assert.match(reauth,/returnTo=/);
  assert.match(reauth,/qa-b\.html\?run=1&candidate=/);
});

test('non-Preview builds are not required to contain Preview-only injected identity', {skip:isPreview}, ()=>{
  const config=source('public-config.js');
  assert.doesNotMatch(config,/"previewCandidateSha"\s*:/);
  assert.doesNotMatch(source('qa-b.html'),/const CANDIDATE_SHA='[0-9a-f]{40}';/);
});
