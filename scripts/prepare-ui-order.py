from pathlib import Path
import hashlib
import json

p=Path('final-release-ui.js')
s=p.read_text()
b=p.read_bytes()
assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()=='f3d62bdf1b57f6dcf1a3d40ff3ce5606410ef66c', 'Source changed; review required'
marker="  const PRODUCT_RELEASE='V266';\n"
helper='''
  // Presentation loading is not authorization. The auth bridge must finish
  // verifying and activating BOTH data boundaries before optional UI boots.
  let uiStartQueued=false;
  function authenticatedUIReady(){
    try{
      const context=window.AQARI_SUPABASE?.context;
      const userId=context?.user?.id,workspaceId=context?.workspace?.id,member=context?.membership;
      if(typeof userId!=='string'||!userId||typeof workspaceId!=='string'||!workspaceId||
         member?.is_active!==true||member.user_id!==userId||member.workspace_id!==workspaceId||
         !['general_manager','property_manager','accountant','viewer'].includes(member.role)||
         !document.documentElement?.classList.contains('aqari-auth-unlocked'))return false;
      const data=window.AQARI_DATA_GATE?.scope,storage=window.AQARI_EARLY_STORAGE_GATE?.scope;
      return data?.userId===userId&&data.workspaceId===workspaceId&&
        storage?.userId===userId&&storage.workspaceId===workspaceId;
    }catch(_){return false;}
  }
  function noteScriptLoaded(event){
    if(event?.type==='load'&&event.target?.dataset){
      event.target.dataset.aqariUiLoaded='true';
    }
  }
  function continueExistingScript(id,next,ready=false){
    const node=document.getElementById(id);
    if(!node)return false;
    if(ready||node.dataset.aqariUiLoaded==='true')next();
    else if(node.dataset.aqariUiNextBound!=='true'){
      node.dataset.aqariUiNextBound='true';
      node.addEventListener('load',next,{once:true});
    }
    return true;
  }
  function scheduleAuthenticatedUI(){
    if(uiStartQueued)return;
    uiStartQueued=true;
    setTimeout(function(){
      uiStartQueued=false;
      if(authenticatedUIReady()&&document.getElementById('aqari-v199-ui-js')?.dataset.aqariUiLoaded==='true')installV201Experience();
    },0);
  }
  window.addEventListener('aqari:auth-boundary',function(event){
    if(event?.detail?.state==='ready')scheduleAuthenticatedUI();
  });
'''
assert s.count(marker)==1
s=s.replace(marker,marker+helper)
for name in ['installV266SchedulerControl','installV211FollowUpCenter','installV210DailyCommandCenter','installV209GlobalSearch','installV208PortfolioCollections','installV206RentLedger','installV205SimplifiedShell','installV202PropertyOS','installV201Experience']:
    old=f'  function {name}(){{'
    assert s.count(old)==1
    s=s.replace(old,f'  function {name}(event){{\n    noteScriptLoaded(event);\n    if(!authenticatedUIReady())return;')
s=s.replace("    if(document.getElementById('aqari-v201-experience-js')){\n      installV202PropertyOS();\n      return;\n    }", "    if(continueExistingScript('aqari-v201-experience-js',installV202PropertyOS,Boolean(window.AQARI_V201)))return;")
s=s.replace("    }else if(document.body?.getAttribute('data-v202-ready') === 'true'){", "    }else if(document.getElementById('aqari-v202-property-os-js').dataset.aqariUiLoaded==='true'||document.body?.getAttribute('data-v202-ready') === 'true'){")
s=s.replace("      document.getElementById('aqari-v202-property-os-js')?.addEventListener('load', installV205SimplifiedShell, { once:true });", "      continueExistingScript('aqari-v202-property-os-js',installV205SimplifiedShell);")
s=s.replace("    }else{\n      installV206RentLedger();\n    }", "    }else{\n      continueExistingScript('aqari-v205-simplified-shell-js',installV206RentLedger,Boolean(window.AQARI_V205));\n    }")
s=s.replace("    }else{\n      installV208PortfolioCollections();\n    }", "    }else{\n      continueExistingScript('aqari-v206-rent-ledger-js',installV208PortfolioCollections,Boolean(window.AQARI_V206));\n    }")
s=s.replace("    }else if(document.querySelector('meta[name=\"aqari-portfolio-collections\"]')){", "    }else if(portfolioJs.dataset.aqariUiLoaded==='true'||document.querySelector('meta[name=\"aqari-portfolio-collections\"]')){")
s=s.replace("    }else if(window.AQARI_V209?.version===", "    }else if(globalSearchJs.dataset.aqariUiLoaded==='true'||window.AQARI_V209?.version===")
s=s.replace("    }else if(window.AQARI_V210?.version===", "    }else if(commandJs.dataset.aqariUiLoaded==='true'||window.AQARI_V210?.version===")
for var,name in [('propertyOS','installV205SimplifiedShell'),('experience','installV202PropertyOS'),('shell','installV206RentLedger'),('script','installV208PortfolioCollections'),('script','installV201Experience')]:
    old=f"      {var}.addEventListener('load', {name}, {{ once:true }});"
    if old not in s:old=f"    {var}.addEventListener('load', {name}, {{ once:true }});"
    assert old in s
    indent=old[:len(old)-len(old.lstrip())]
    s=s.replace(old,indent+f"{var}.dataset.aqariUiNextBound='true';\n"+old)
s=s.replace("    }else{\n      installV201Experience();\n    }", "    }else{\n      continueExistingScript('aqari-v199-ui-js',installV201Experience);\n    }")
p.write_text(s)

p=Path('tests/startup-ui-loading.test.cjs');s=p.read_text()
assert 'if(callback)callback();' in s
s=s.replace('if(callback)callback();', "if(callback)callback({type:'load',target:node});")
p.write_text(s)

p=Path('tests/v209-loader.test.cjs');s=p.read_text()
s=s.replace("source.indexOf('function installV209GlobalSearch')", 'source.indexOf("const PRODUCT_RELEASE=")')
s=s.replace("    all.push(node);\n    (node.tagName", "    if(['aqari-v199-ui-js','aqari-v201-experience-js','aqari-v202-property-os-js','aqari-v205-simplified-shell-js','aqari-v206-rent-ledger-js'].includes(id))node.dataset.aqariUiLoaded='true';\n    all.push(node);\n    (node.tagName")
s=s.replace("    readyState:'complete',", "    readyState:'complete',\n    documentElement:{classList:{contains:name=>name==='aqari-auth-unlocked'}},")
s=s.replace('  return {\n    document,', "  const scope={userId:'user-a',workspaceId:'workspace-a'};\n  const window={AQARI_SUPABASE:{context:{user:{id:'user-a'},workspace:{id:'workspace-a'},membership:{user_id:'user-a',workspace_id:'workspace-a',role:'general_manager',is_active:true}}},AQARI_DATA_GATE:{scope},AQARI_EARLY_STORAGE_GATE:{scope},addEventListener(){}};\n\n  return {\n    document,")
s=s.replace('vm.runInNewContext(secondLoaderIife(),{document}', 'vm.runInNewContext(secondLoaderIife(),{document,window,setTimeout:fn=>fn()}')
p.write_text(s)

p=Path('tests/v266-authenticated-home.e2e.mjs');s=p.read_text()
anchor='          setInterval(()=>{window.__homeHeartbeats=(window.__homeHeartbeats||0)+1;},100);'
assert anchor in s
instrument='''
          window.__earlyAuthenticatedScripts=[];
          const append=Node.prototype.appendChild;
          Node.prototype.appendChild=function(node){
            if(node?.tagName==='SCRIPT'&&/^aqari-v(?:201|202|205|206|208|209|210|211|266)-/.test(node.id||'')&&!document.documentElement.classList.contains('aqari-auth-unlocked')){
              window.__earlyAuthenticatedScripts.push(node.id);
            }
            return append.call(this,node);
          };'''
s=s.replace(anchor,anchor+instrument)
anchor='          await delay(700);\n          assert.ok(await page.locator(\'#home\').isVisible());'
assert anchor in s
replacement='''          await page.waitForFunction(()=>['201','202','205','206','208','209','210','211','266'].every(version=>Boolean(window['AQARI_V'+version])),{},{timeout:18000});
          assert.deepEqual(await page.evaluate(()=>window.__earlyAuthenticatedScripts),[], 'authenticated UI must not initialize during confirmation');
          const beats=await page.evaluate(()=>window.__homeHeartbeats);
          await delay(1000);
          assert.ok(await page.evaluate(()=>window.__homeHeartbeats)>beats,'the completed UI must remain responsive');
          for(const [route,target] of [['properties','list'],['tenants','list'],['smartContractsPage','smartContractsPage'],['collectionProPage','collectionProPage'],['maintenanceProPage','maintenanceProPage'],['home','home']]){
            await page.evaluate(route=>window.go(route),route);
            assert.ok(await page.locator('#'+target).isVisible(),'visible full-platform section: '+route);
          }
          assert.ok(await page.locator('#home').isVisible());'''
s=s.replace(anchor,replacement)
p.write_text(s)

p=Path('.github/workflows/runtime-contracts.yml');s=p.read_text()
assert 'node --test tests/runtime-contracts.test.cjs' in s
s=s.replace('node --test tests/runtime-contracts.test.cjs','node --test tests/startup-ui-loading.test.cjs tests/runtime-contracts.test.cjs')
p.write_text(s)

changed=['final-release-ui.js','tests/startup-ui-loading.test.cjs','tests/v209-loader.test.cjs','tests/v266-authenticated-home.e2e.mjs','.github/workflows/runtime-contracts.yml']
p=Path('FILE_INVENTORY.json');inventory=json.loads(p.read_text());entries={item['path']:item for item in inventory['files']}
for name in changed:
    data=Path(name).read_bytes()
    item={'path':name,'size':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    if name in entries:entries[name].update(item)
    else:inventory['files'].append(item)
p.write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+'\n')
print('Updated only UI loader, regression tests, CI test list and exact inventory.')
