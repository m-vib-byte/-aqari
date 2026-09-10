import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as server from '../lib/release-config.js';

// These are the currently observed domain and data source. Changing either
// requires a reviewed release configuration, never an implicit preview promotion.
const productionOrigin = 'https://myaqari.com';
const productionProject = 'djkpkkgoibruaezdrchb';

export function deploymentTargetErrors(environment, browser, backend) {
  if (backend.PRODUCT_VERSION !== 'V267') return [];
  const errors = [];
  const publicConfig = backend.SUPABASE_PUBLIC_CONFIG || {};
  if (browser.productVersion !== backend.PRODUCT_VERSION ||
      browser.releaseStage !== backend.RELEASE_STAGE ||
      browser.supabaseUrl !== publicConfig.url ||
      browser.supabasePublishableKey !== publicConfig.publishableKey) {
    errors.push('Browser and server release configuration disagree.');
  }
  if (environment !== 'production') return errors;
  if (browser.releaseStage !== 'production' || backend.RELEASE_STAGE !== 'production') {
    errors.push('Production cannot deploy a V267 preview configuration.');
  }
  const expectedUrl = `https://${productionProject}.supabase.co`;
  if (browser.supabaseUrl !== expectedUrl || publicConfig.url !== expectedUrl ||
      browser.supabaseAuthStorageKey !== `sb-${productionProject}-auth-token`) {
    errors.push('Production must preserve the current domain data source and session namespace.');
  }
  if (browser.supabaseAuthRedirectUrl !== `${productionOrigin}/login.html?release=V267`) {
    errors.push('Production Auth callbacks must return to myaqari.com.');
  }
  return errors;
}

export function verifyDeploymentTarget(environment = process.env.VERCEL_ENV) {
  const context = {window:{}};
  runInNewContext(readFileSync(new URL('../public-config.js', import.meta.url), 'utf8'), context, {timeout:1000});
  const errors = deploymentTargetErrors(environment, context.window.AQARI_PUBLIC_CONFIG || {}, server);
  if (errors.length) throw new Error('Invalid deployment target:\n' + errors.join('\n'));
}
