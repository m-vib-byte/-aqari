from pathlib import Path
import hashlib,json
preview=Path('tests/preview.e2e.mjs')
s=preview.read_text()
b=preview.read_bytes()
assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()=='667226e5759bec54633958e0e0da2303fc271240'
def block(title):
    a=s.index("await check('"+title+"', async () => {")
    z=s.index('\n});',a)+len('\n});')
    return a,z,s[a:z]
def body(title):
    value=block(title)[2]
    return value[value.index('async () => {')+len('async () => {'):-len('\n});')]
first_title='V205 simplified platform loads on the secure V198 runtime'
first=body(first_title)
state=first[first.index('  const state = await page.evaluate'):first.index('  if(!state.gate ||')]
assertions=first[first.index("  if(state.design !=="):]
navtitle='V205 keeps one visible mobile navigation with five clear sections'
dailytitle='V205 daily actions are complete and safe before property selection'
searchtitle='V209 signed-out search stays sealed and fits the iPhone viewport'
commandtitle='V210 signed-out command center stays sealed and mobile-safe'
quicktitle='V201 quick-create respects the auth gate and keeps an accessible modal'
search=body(searchtitle)
search=search.replace("  if(state.inputValue||!state.signedOutMessage||state.protectedProperties!==0)throw new Error('signed-out V209 search exposed or retained protected data');", "  if(state.inputValue)throw new Error('search must initially be empty');")
quick=body(quicktitle)
quick=quick[quick.index("  await page.locator('#v205SimpleHome"):]
helper="""// Full presentation assertions moved from the signed-out Preview to a
// server-verified synthetic session. No authorization checks are bypassed.
export async function assertAuthenticatedPresentation(page){
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(350);
  {\n"""+state+assertions+"\n  }\n  {"+body(navtitle)+"\n  }\n  {"+body(dailytitle)+"\n  }\n  {"+search+"\n  }\n  {"+quick+"\n  }\n"+"""
  const command=await page.evaluate(()=>({
    version:window.AQARI_V210?.version,
    css:Boolean(document.getElementById('aqari-v210-daily-command-center-css')),
    script:Boolean(document.getElementById('aqari-v210-daily-command-center-js')),
    meta:document.querySelector('meta[name="aqari-daily-command-center"]')?.content,
    ledgerCss:Boolean(document.getElementById('aqari-v206-integrated-ledger-css'))
  }));
  if(command.version!=='V210-daily-command-center'||!command.css||!command.script||
     command.meta!=='V210-daily-command-center'||!command.ledgerCss)throw new Error('complete UI assets not ready after verified login');
}
export async function assertSignedOutAfterUse(page){
  await page.evaluate(()=>window.AQARI_SUPABASE.signOut());
  await page.waitForFunction(()=>!document.documentElement.classList.contains('aqari-auth-unlocked')&&
    !window.AQARI_SUPABASE?.context?.user,{},{timeout:15000});
  const state=await page.evaluate(()=>({
    data:window.AQARI_DATA_GATE?.scope||null,
    storage:window.AQARI_EARLY_STORAGE_GATE?.scope||null,
    gate:Boolean(document.getElementById('aqariCloudGateV168')?.getClientRects().length),
    home:getComputedStyle(document.getElementById('home')).display,
    privateText:document.body.innerText.includes('Synthetic Tenant'),
    visibleDialog:document.getElementById('v202DocumentDialog')?.getAttribute('aria-hidden')==='false'
  }));
  if(state.data||state.storage||!state.gate||state.privateText||state.visibleDialog)throw new Error('logout failed to seal previously used workspace: '+JSON.stringify(state));
}
"""
Path('tests/full-ui-acceptance.mjs').write_text(helper)
old=block(first_title)[2]
new=old[:old.index('  if(state.design !==')]+"""  const deferred=await page.evaluate(()=>({
    modules:['201','202','205','206','208','209','210','211','266'].filter(v=>Boolean(window['AQARI_V'+v])),
    scripts:Array.from(document.scripts).map(n=>n.id).filter(id=>/^aqari-v(?:201|202|205|206|208|209|210|211|266)-/.test(id)),
    data:window.AQARI_DATA_GATE?.scope||null,storage:window.AQARI_EARLY_STORAGE_GATE?.scope||null
  }));
  if(deferred.modules.length||deferred.scripts.length||deferred.data||deferred.storage)throw new Error('authenticated UI must remain deferred while signed out: '+JSON.stringify(deferred));
  if(state.horizontalOverflow)throw new Error('public login overflows at 390px');
});"""
s=s.replace(old,new.replace(first_title,'Login presentation is ready while authenticated modules remain deferred'))
for title,selector in [(searchtitle,'#v209SearchResults .v209-result'),(commandtitle,'#v210DailyCommandCenter'),(navtitle,'#v205PrimarySections'),(dailytitle,'#v205DailyActions')]:
    a,z,old=block(title)
    replacement="await check("+json.dumps('Signed-out deferral: '+title)+", async () => {\n"+"""  const state=await page.evaluate(selector=>({
    authenticated:Boolean(window.AQARI_SUPABASE?.context?.user),
    exposed:Array.from(document.querySelectorAll(selector)).some(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden'),
    modules:['201','202','205','206','208','209','210','211','266'].filter(v=>Boolean(window['AQARI_V'+v])),
    gate:document.getElementById('aqariCloudGateV168')?.getAttribute('role'),
    modal:document.getElementById('aqariCloudGateV168')?.getAttribute('aria-modal'),
    overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1
  }),"""+json.dumps(selector)+");\n"+"  if(state.authenticated||state.exposed||state.modules.length||state.gate!=='dialog'||state.modal!=='true'||state.overflow)throw new Error('signed-out surface is not sealed: '+JSON.stringify(state));\n});"
    s=s[:a]+replacement+s[z:]
s=s.replace("  if(!state.cssLoaded) throw new Error('V206 ledger stylesheet missing');", "  if(state.cssLoaded)throw new Error('authenticated ledger must not initialize before login');")
preview.write_text(s)
home=Path('tests/v266-authenticated-home.e2e.mjs')
h=home.read_text()
# Independent recovery fixture: no longer rewrite the full-platform test in CI.
r=h
start=r.index("          await page.waitForFunction(()=>['201'")
end=r.index("          assert.ok(await page.locator('#home').isVisible());",start)+len("          assert.ok(await page.locator('#home').isVisible());")
r=r[:start]+"          await delay(700);\n          assert.ok(await page.locator('#home').isVisible());"+r[end:]
replacements={"localStorage.setItem('aqari-supabase-auth-v198',JSON.stringify(value));":"if(value)localStorage.setItem('aqari-supabase-auth-v198',JSON.stringify(value));",'},session);':"},scenario==='manual'?null:session);","base+'/login?release=V266&manual=1'":"base+'/recovery.html'","assert.equal(new URL(page.url()).pathname,'/login','manual entry must not restore/redirect');":"assert.equal(new URL(page.url()).pathname,'/recovery.html');","await page.waitForURL('**/app?release=V266');":"await page.waitForFunction(()=>document.documentElement.classList.contains('aqari-auth-unlocked'),{},{timeout:18000});","base+'/app?release=V266'":"base+'/recovery.html'","const tenant='Synthetic Tenant '+i,unit=String(i)":"const tenant=i===1?'<img src=x onerror=alert(1)>':'Synthetic Tenant '+i,unit=String(i)","'test-results','authenticated-home'":"'test-results','recovery-entry'"}
for old,new in replacements.items():
    assert old in r,old
    r=r.replace(old,new)
anchor="          assert.ok(await page.locator('#home').isVisible());"
assert r.count(anchor)==1
r=r.replace(anchor,anchor+"""
          assert.equal(await page.locator('script[src*="v202-property-os"],script[src*="final-release-ui"],script[src*="secure-auth-bridge"]').count(),0);
          assert.equal(await page.locator('#workspaceName').textContent(),workspace.name);
          assert.equal(await page.evaluate(()=>window.AQARI_RECOVERY.readOnly),true);
          if(scenario!=='empty'){
            assert.equal(await page.locator('#tenantsTable tbody tr').count(),110);
            assert.ok((await page.locator('#tenantsTable').textContent()).includes('<img src=x onerror=alert(1)>'));
            assert.equal(await page.locator('#tenantsTable img').count(),0);
          }
          assert.equal(requests.some(r=>/^(PATCH|PUT|DELETE) /.test(r)),false);
""")
Path('tests/recovery.e2e.mjs').write_text(r)
h="import {assertAuthenticatedPresentation,assertSignedOutAfterUse} from './full-ui-acceptance.mjs';\n"+h
anchor="          assert.ok(await page.locator('#home').isVisible());"
assert h.count(anchor)==1
h=h.replace(anchor,anchor+'\n          await assertAuthenticatedPresentation(page);')
anchor="        await page.screenshot({path:path.join(out,name+'.png')});"
assert h.count(anchor)==1
h=h.replace(anchor,anchor+"\n        if(!['timeout','confirmation-timeout'].includes(scenario))await assertSignedOutAfterUse(page);")
anchor="    if(url.pathname==='/auth/v1/user')return send(res,user);"
assert anchor in h
h=h.replace(anchor,"    if(url.pathname==='/auth/v1/logout'&&req.method==='POST'){res.writeHead(204);res.end();return;}\n"+anchor)
home.write_text(h)
changed=['tests/preview.e2e.mjs','tests/full-ui-acceptance.mjs','tests/v266-authenticated-home.e2e.mjs','tests/recovery.e2e.mjs','.github/workflows/recovery-entry.yml']
p=Path('FILE_INVENTORY.json');inv=json.loads(p.read_text());entries={item['path']:item for item in inv['files']}
for name in changed:
    data=Path(name).read_bytes();entry={'path':name,'size':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    if name in entries:entries[name].update(entry)
    else:inv['files'].append(entry)
p.write_text(json.dumps(inv,ensure_ascii=False,indent=2)+'\n')
print('Moved UI assertions to authenticated acceptance, preserved signed-out privacy, isolated recovery tests.')
