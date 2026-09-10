import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const PROTECTED_PROJECTS=new Set(['qtavnufzbkdfeauyukot','djkpkkgoibruaezdrchb']);
export function stageConfiguration({url,publishableKey},existing){
 const match=String(url).match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/);
 if(!match||PROTECTED_PROJECTS.has(match[1]))throw Error('ISOLATED_STAGING_PROJECT_REQUIRED');
 if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(String(publishableKey)))throw Error('PUBLISHABLE_KEY_REQUIRED');
 if(!existing.includes("export const PRODUCT_VERSION = 'V267'"))throw Error('V267_ONLY');
 if((existing.match(/url: '[^']+'/g)||[]).length!==1||(existing.match(/publishableKey: '[^']+'/g)||[]).length!==1||(existing.match(/export const RELEASE_STAGE = '[^']+'/g)||[]).length!==1)throw Error('CONFIG_LAYOUT_CHANGED');
 let config=existing.replace(/url: '[^']+'/,`url: '${url.replace(/\/$/,'')}'`).replace(/publishableKey: '[^']+'/,`publishableKey: '${publishableKey}'`).replace(/export const RELEASE_STAGE = '[^']+'/,"export const RELEASE_STAGE = 'preview'");
 const browser='window.AQARI_PUBLIC_CONFIG = Object.freeze('+JSON.stringify({version:'V198',apiContractVersion:'V198',productVersion:'V267',releaseStage:'preview',supabaseAuthRedirectUrl:'https://aqari-git-design-v267-premium-workspace-m-vib-5421.vercel.app/login.html?release=V267',supabaseUrl:url.replace(/\/$/,''),supabasePublishableKey:publishableKey,supabaseAuthStorageKey:'sb-'+match[1]+'-auth-token'},null,2)+');\n';
 return {server:config,browser};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);if(args.length!==2)throw Error('Usage: node scripts/configure-v267-staging.mjs https://PROJECT.supabase.co sb_publishable_KEY');
 const result=stageConfiguration({url:args[0],publishableKey:args[1]},readFileSync('lib/release-config.js','utf8'));
 writeFileSync('lib/release-config.js',result.server);writeFileSync('public-config.js',result.browser);
 console.log('V267 staging configuration prepared. Review and test before preview deployment.');
}
