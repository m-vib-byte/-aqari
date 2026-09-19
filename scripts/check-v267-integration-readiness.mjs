import {readFileSync} from 'node:fs';

const manifest=JSON.parse(readFileSync(new URL('../config/v267-integration-readiness.json',import.meta.url),'utf8'));
const providers=new Set(['knet','email','whatsapp','sms','push','quickbooks','zoho_books','xero','generic_webhook']);
const kinds=new Set(['payment','notification','accounting','webhook']);
const secret=/^AQARI_[A-Z0-9_]+_PROVIDER_SECRET$/;
const endpoint=/^AQARI_[A-Z0-9_]+_PROVIDER_ORIGIN$/;
const inbound=/^AQARI_WEBHOOK_SECRET_<WORKSPACE_UUID>_[A-Z0-9_]+$/;
if(manifest?.schemaVersion!==1||manifest?.release!=='V267'||manifest?.stage!=='preview')throw Error('INTEGRATION_MANIFEST_IDENTITY_INVALID');
if(!Array.isArray(manifest.providers)||manifest.providers.length!==providers.size)throw Error('INTEGRATION_PROVIDER_SET_INVALID');
const seen=new Set(),endpoints=new Set(),secrets=new Set();
for(const item of manifest.providers){
 if(!item||!providers.has(item.provider)||seen.has(item.provider)||!kinds.has(item.kind))throw Error('INTEGRATION_PROVIDER_INVALID');
 seen.add(item.provider);
 if(item.endpointRequired!==true||!endpoint.test(String(item.endpointReference||''))||!secret.test(String(item.secretReference||''))||!inbound.test(String(item.webhookSecretPattern||'')))throw Error('INTEGRATION_CREDENTIAL_CONTRACT_INVALID');
 if(endpoints.has(item.endpointReference)||secrets.has(item.secretReference))throw Error('INTEGRATION_ENV_REFERENCE_REUSED');
 endpoints.add(item.endpointReference);secrets.add(item.secretReference);
 if(item.kind==='notification'&&item.outboundPath!==`/messages/${item.provider}`)throw Error('INTEGRATION_NOTIFICATION_PATH_INVALID');
 if(item.kind==='payment'&&item.outboundPath!=='/payments')throw Error('INTEGRATION_PAYMENT_PATH_INVALID');
 if(item.kind==='accounting'&&item.outboundPath!=='/accounting/v1/journal-exports')throw Error('INTEGRATION_ACCOUNTING_PATH_INVALID');
 if(item.kind==='webhook'&&item.outboundPath!==null)throw Error('INTEGRATION_WEBHOOK_PATH_INVALID');
}
for(const provider of providers)if(!seen.has(provider))throw Error('INTEGRATION_PROVIDER_MISSING');
const rules=manifest.rules||{};
for(const key of ['runtimeStartsDisabled','httpsOnly','secretsServerSideOnly','idempotencyRequired','providerNativeAdapterRequiredBeforeLive','noCredentialValuesInDatabase'])if(rules[key]!==true)throw Error('INTEGRATION_SAFETY_RULE_MISSING:'+key);
console.log('V267 integration readiness manifest: PASS');
