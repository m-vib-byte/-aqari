const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const modulePromise=import(pathToFileURL(path.resolve(__dirname,'../middleware.js')).href);
test('root-only middleware selects the public static form and keeps query parameters',async()=>{
  const {default:middleware,config}=await modulePromise;
  assert.equal(config.matcher,'/');
  for(const method of ['GET','HEAD']){
    const response=middleware(new Request('https://myaqari.com/?manual=1&release=V267',{method}));
    assert.equal(response.status,200);
    assert.equal(response.headers.get('location'),null);
    assert.equal(response.headers.get('x-middleware-rewrite'),'https://myaqari.com/login.html?manual=1&release=V267');
    assert.match(response.headers.get('cache-control'),/no-store/);
  }
});
test('app, login, API and static assets never change their existing handlers',async()=>{
  const {default:middleware}=await modulePromise;
  for(const url of ['/app?release=V267','/login?manual=1','/index.html','/api/db/status','/supabase-adapter.js','/vendor/supabase-js-2.114.0.js']){
    const response=middleware(new Request('https://myaqari.com'+url));
    assert.equal(response.headers.get('x-middleware-next'),'1');
    assert.equal(response.headers.get('x-middleware-rewrite'),null);
  }
});
test('rewrite remains same-origin and does not take a destination from input',async()=>{
  const {default:middleware}=await modulePromise;
  const response=middleware(new Request('https://myaqari.com/?next=https://example.invalid'));
  const target=new URL(response.headers.get('x-middleware-rewrite'));
  assert.equal(target.origin,'https://myaqari.com');assert.equal(target.pathname,'/login.html');
  assert.equal(middleware(new Request('https://myaqari.com/',{method:'POST'})).headers.get('x-middleware-next'),'1');
});
