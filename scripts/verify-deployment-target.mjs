import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as server from '../lib/release-config.js';

// Production and the explicitly authorized single-domain trial are separate
// deployment modes. Trial mode is allowed to use the production Vercel target
// only when it stays on the isolated V267 Supabase project and myaqari.com is
// the sole auth-return host. It never authorizes Production data.
const productionOrigin = 'https://myaqari.com';
const productionProject = 'djkpkkgoibruaezdrchb';
const isolatedTrialProject = 'ofgmcsmxmdswlovsckqs';

export function deploymentTargetErrors(environment, browser, backend, trial = null) {
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

  const trialEnabled = trial?.enabled === true;
  if (trialEnabled) {
    const expectedUrl = `https://${isolatedTrialProject}.supabase.co`;
    if (trial.hostname !== 'myaqari.com' || trial.projectRef !== isolatedTrialProject ||
        !/^sb_publishable_[A-Za-z0-9_-]+$/.test(String(trial.publishableKey || ''))) {
      errors.push('Production-target trial must use the reviewed isolated myaqari target.');
    }
    if (browser.releaseStage !== 'preview' || backend.RELEASE_STAGE !== 'preview') {
      errors.push('Single-domain trial must remain a preview-stage V267 runtime.');
    }
    if (browser.supabaseUrl !== expectedUrl || publicConfig.url !== expectedUrl ||
        browser.supabaseAuthStorageKey !== `sb-${isolatedTrialProject}-auth-token` ||
        browser.supabasePublishableKey !== trial.publishableKey || publicConfig.publishableKey !== trial.publishableKey) {
      errors.push('Single-domain trial must remain on the isolated V267 data source and session namespace.');
    }
    if (browser.supabaseAuthRedirectUrl !== `${productionOrigin}/login.html?release=V267`) {
      errors.push('Single-domain trial Auth callbacks must return only to myaqari.com.');
    }
    return errors;
  }

  if (browser.releaseStage !== 'production' || backend.RELEASE_STAGE !== 'production') {
    errors.push('Production cannot deploy a V267 preview configuration without the explicit isolated domain-trial target.');
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
  let trial = null;
  try {
    trial = JSON.parse(readFileSync(new URL('../config/domain-trial-target.json', import.meta.url), 'utf8'));
  } catch {
    if (environment === 'production') throw new Error('Invalid deployment target:\nDomain trial target configuration is unreadable.');
  }
  if (environment === 'production' && process.env.AQARI_ENABLE_DOMAIN_TRIAL !== '1' && trial) trial = {...trial, enabled:false};\n  const errors = deploymentTargetErrors(environment, context.window.AQARI_PUBLIC_CONFIG || {}, server, trial);
  if (errors.length) throw new Error('Invalid deployment target:\n' + errors.join('\n'));
}
