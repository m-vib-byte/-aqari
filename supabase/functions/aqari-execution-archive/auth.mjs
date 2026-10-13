import {createRemoteJWKSet, customFetch, jwtVerify} from 'jose';

const owner = 'm-vib-5421';
const issuer = `https://oidc.vercel.com/${owner}`;
// Verified through the team's public OpenID discovery document. Never select
// an issuer or a key URL from an unverified token or an incoming request.
const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`), {
  timeoutDuration: 5000,
  [customFetch]: (url, options) => fetch(url, {...options, redirect: 'error'}),
});
const environments = Object.freeze({
  'https://djkpkkgoibruaezdrchb.supabase.co': 'production',
  'https://ofgmcsmxmdswlovsckqs.supabase.co': 'preview',
});

export function environmentFor(url) {
  if (!Object.hasOwn(environments, url)) throw Error('UNCONFIGURED_PROJECT');
  return environments[url];
}

export async function verifyWorkload(token, environment, keySet = keys) {
  if (!['production', 'preview'].includes(environment) || typeof token !== 'string'
      || token.length > 16384 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
    throw Error('ACCESS_DENIED');
  }
  const {payload} = await jwtVerify(token, keySet, {
    algorithms: ['RS256'], typ: 'JWT', issuer,
    audience: `https://vercel.com/${owner}`,
    subject: `owner:${owner}:project:aqari:environment:${environment}`,
    requiredClaims: ['iat', 'nbf', 'exp', 'owner', 'owner_id', 'project', 'project_id', 'environment'],
    maxTokenAge: '2h', clockTolerance: 5,
  });
  if (payload.owner !== owner || payload.owner_id !== 'team_3JLkJpO4ZFRwQrkmAR9AQUT5'
      || payload.project !== 'aqari' || payload.project_id !== 'prj_qQcBwwuucyXoyUSbIVwjhPKmA97E'
      || payload.environment !== environment || payload.exp - payload.iat > 7205) {
    throw Error('ACCESS_DENIED');
  }
}
