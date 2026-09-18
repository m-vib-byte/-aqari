import localeVmSource from './helpers/locale-vm.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mountPortalAccountRecovery,portalRecoveryCallback} from '../src/v267/components/portal-account-recovery.js';

const source='const {LANGUAGES,bindLocale,getLocale,setLocale,direction,t,message,dateLocale,hasTranslation,restorePortalLocale,savePortalLocale,refreshPortalLabels}='+localeVmSource()+';\n'+fs.readFileSync('v267-partner-portal.js','utf8').replace(/^import .*;$/gm,'');
const tick=()=>new Promise(r=>setTimeout(r,0));
function fixture({pending=false,hash=''}={}){
 const elements=new Map(),all=[],events=new Map(),docEvents=new Map();let reads=0,locale='ar',boundary,resolve;
 const doc={documentElement:{},hidden:false,createElement(tag){return new Element(tag);},getElementById(id){if(!elements.has(id)){const e=new Element('div');e.id=id;elements.set(id,e);}return elements.get(id);},querySelectorAll(selector){return ['[data-aq267-text]','[data-portal-label]'].includes(selector)?[]:all.filter(el=>['button','input','select'].includes(el.tagName));},addEventListener(name,fn){docEvents.set(name,fn);}};
 class Element{constructor(tag){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.dataset={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;all.push(this);}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(key,value){this[key]=value;}focus(){}reportValidity(){return true;}}
 const $=id=>doc.getElementById(id),client={auth:{signOut:async()=>({}),signInWithPassword:async()=>({})}},settings=[],redirects=[];
 const window={dispatchEvent(){},location:{origin:'https://current-preview.example',hash,replace:path=>redirects.push(path)},AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co',releaseStage:'preview',supabasePublishableKey:'synthetic',supabaseAuthStorageKey:'isolated'},supabase:{createClient(_url,_key,options){settings.push(options);return client;}},fetch:async()=>{throw Error('NO_REAL_NETWORK');},addEventListener:(name,fn)=>events.set(name,fn)};
 const read=async()=>{reads++;if(pending)return new Promise(r=>{resolve=r;});return {properties:[]};};
 const ctx={CustomEvent:class{constructor(type,options){this.type=type;Object.assign(this,options);}},window,document:doc,console,URL,URLSearchParams,setTimeout,clearTimeout,LANGUAGES:{ar:'العربية',en:'English'},getLocale:()=>locale,setLocale:value=>{locale=value;},bindLocale:()=>{locale='ar';},direction:()=>locale==='ar'?'rtl':'ltr',t:value=>value,setText:(el,text)=>{el.textContent=text;},refreshText(){},uiText:(tag,text)=>{const el=doc.createElement(tag);el.textContent=text;return el;},partnerDistributionView:()=>doc.createElement('div'),mountPortalAccountRecovery,portalRecoveryCallback,createPartnerSession(_client,callback){boundary=callback;return {read,invalidate:callback};}};
 vm.runInNewContext(source,ctx);
 return {$,window,settings,redirects,events,docEvents,get reads(){return reads;},boundary:()=>boundary(),resolve:()=>resolve({properties:[]})};
}
test('partner recovery clears property content and blocks refresh and visibility reads',async()=>{
 const f=fixture();await tick();f.$('partnerSummary').textContent='PRIVATE PARTNER DATA';f.$('partnerContent').hidden=false;
 f.$('partnerForgotPassword').onclick();assert.equal(f.$('partnerContent').hidden,true);assert.equal(f.$('partnerAuth').hidden,true);assert.equal(f.$('partnerRecovery').hidden,false);
 const before=f.reads;f.$('partnerRefresh').onclick();await tick();f.docEvents.get('visibilitychange')();await tick();assert.equal(f.reads,before);
 f.boundary();assert.equal(f.$('partnerAuth').hidden,true);const passwordForm=f.$('partnerRecovery').children[4];assert.equal(passwordForm.hidden,true);assert.equal(passwordForm.children.at(-1).disabled,true);
 await f.$('partnerRecovery').children.at(-1).onclick();assert.equal(f.$('partnerRecovery').hidden,true);assert.equal(f.$('partnerAuth').hidden,false);
});
test('late partner load cannot replace an opened recovery screen',async()=>{
 const f=fixture({pending:true});await tick();f.$('partnerForgotPassword').onclick();f.resolve();await tick();assert.equal(f.$('partnerRecovery').hidden,false);assert.equal(f.$('partnerAuth').hidden,true);assert.equal(f.$('partnerContent').hidden,true);
});
test('recovery callbacks use the isolated reset page before any partner RPC or token persistence',async()=>{
 const f=fixture({hash:'#type=recovery&access_token=synthetic&refresh_token=synthetic'});await tick();assert.equal(f.reads,0);assert.deepEqual(f.redirects,['/reset-password.html#type=recovery&access_token=synthetic&refresh_token=synthetic']);assert.equal(f.settings[0].auth.detectSessionInUrl,false);
});
