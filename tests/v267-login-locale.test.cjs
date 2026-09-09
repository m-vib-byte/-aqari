const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('login.html','utf8'),inline=html.match(/<script>([\s\S]*?)<\/script>/)[1],locale=fs.readFileSync('v267-login-locale.js','utf8');
const messages=JSON.parse(locale.slice(locale.indexOf('const messages=')+15,locale.indexOf(';\nconst languages')));
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const nodes=new Map(),events=new Map(),requests=[];
 const make=()=>({value:'',textContent:'',hidden:false,disabled:false,children:[],append(x){this.children.push(x)},focus(){},addEventListener(type,fn){this.events??={};this.events[type]=fn}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id)};
 const texts=['أملاكك، بكل وضوح.','لغة الواجهة','دخول','نسيت كلمة المرور'].map(text=>Object.assign(make(),{textContent:text}));get('status').textContent='أدخل البريد وكلمة المرور. تجهيز الاتصال يتم في الخلفية.';
 const api={getClient:async()=>{requests.push('client');return {}},getSession:async()=>null,signIn:async()=>{requests.push('signIn');throw Error('provider_token=secret')},resetPasswordForEmail:async()=>{requests.push('reset')}};
 const window={AQARI_PUBLIC_CONFIG:{releaseStage:'preview'},supabase:{createClient(){}},AQARI_SUPABASE:api,location:{search:'',replace(){}},addEventListener:(type,fn)=>events.set(type,fn)};
 const document={getElementById:get,documentElement:{},querySelectorAll:()=>texts,createElement:make};
 const ctx={window,document,navigator:{},setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(inline,ctx);vm.runInContext(locale,ctx);
 return {get,texts,requests,document,window};
}
test('every login message has four translations and every status source is covered',()=>{
 for(const [source,row] of Object.entries(messages))for(const code of ['en','hi','ur','ml'])assert.ok(typeof row[code]==='string'&&row[code].length&&row[code]!==source,source+': '+code);
 const signup=fs.readFileSync('v267-signup.js','utf8');
 for(const match of (inline+signup).matchAll(/(?:setStatus\(|return )'([^']*[\u0600-\u06ff][^']*)'/g))assert.ok(messages[match[1]],match[1]);
});
test('switching login language preserves credentials and sends no auth or recovery calls',async()=>{
 const f=fixture();await tick();f.get('email').value='literal@example.test';f.get('password').value='<password>{unit}';const before=f.requests.length;
 for(const code of ['ar','en','hi','ur','ml']){
  f.get('loginLanguage').value=code;f.get('loginLanguage').events.change();assert.equal(f.document.documentElement.lang,code);assert.equal(f.document.documentElement.dir,['ar','ur'].includes(code)?'rtl':'ltr');
  assert.equal(f.texts[0].textContent,code==='ar'?'أملاكك، بكل وضوح.':messages['أملاكك، بكل وضوح.'][code]);assert.equal(f.get('email').value,'literal@example.test');assert.equal(f.get('password').value,'<password>{unit}');
  assert.equal(f.get('status').textContent,code==='ar'?'الاتصال جاهز. أدخل البريد وكلمة المرور.':messages['الاتصال جاهز. أدخل البريد وكلمة المرور.'][code]);
 }
 assert.equal(f.requests.length,before);
});
test('new recovery and sign-in statuses use the selected language and hide provider details',async()=>{
 const f=fixture();await tick();f.get('loginLanguage').value='en';f.get('loginLanguage').events.change();
 await f.get('recoveryButton').events.click();assert.equal(f.get('status').textContent,messages['أدخل البريد الإلكتروني أولاً.'].en);assert.ok(!f.requests.includes('reset'));
 f.get('email').value='synthetic@example.test';await f.get('recoveryButton').events.click();assert.equal(f.get('status').textContent,messages['إذا كان الحساب موجودًا فستصل رسالة استعادة كلمة المرور.'].en);
 f.get('password').value='synthetic-only';await f.get('loginForm').events.submit({preventDefault(){}});assert.equal(f.get('status').textContent,messages['تعذر إكمال الطلب. أعد المحاولة.'].en);assert.ok(!f.get('status').textContent.includes('secret'));assert.equal(f.get('password').value,'');
 f.get('loginLanguage').value='ar';f.get('loginLanguage').events.change();assert.equal(f.get('status').textContent,'تعذر إكمال الطلب. أعد المحاولة.');
});
