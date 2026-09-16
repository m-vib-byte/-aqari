import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const navigationPath=new URL('../v199-ui.js',import.meta.url);
let source=readFileSync(navigationPath,'utf8');
const oldBlock=`    const current=window.go;
    const stable=window.AQARI_V199_BASE_GO;
    const runner=stableTargets.includes(target)&&typeof stable==='function'?stable:current;
    let result;
    try{if(typeof runner==='function')result=runner.call(window,target);}
    catch(error){
      if(typeof current==='function'&&current!==runner)result=current.call(window,target);
      else throw error;
    }
    markActive(target);
    const verify=function(){
      if(routeVisible(target)===false&&typeof current==='function'&&current!==runner){
        try{current.call(window,target)}catch(_error){}
      }
      requestAnimationFrame(function(){
        if(routeVisible(target)===true)window.scrollTo({top:0,behavior:'auto'});
      });
    };
    if(result&&typeof result.then==='function')Promise.resolve(result).finally(function(){requestAnimationFrame(verify)});
    else requestAnimationFrame(verify);
    return result;`;
const newBlock=`    const current=window.go;
    const stable=window.AQARI_V199_BASE_GO;
    const primary=stableTargets.includes(target);
    const v205=primary&&window.AQARI_V205&&typeof window.AQARI_V205.navigate==='function'?window.AQARI_V205:null;
    let runner=v205?v205.navigate:current;
    let result;
    try{if(typeof runner==='function')result=runner.call(v205||window,target);}
    catch(error){
      if(primary&&typeof stable==='function'&&stable!==runner){runner=stable;result=stable.call(window,target);}
      else if(typeof current==='function'&&current!==runner){runner=current;result=current.call(window,target);}
      else throw error;
    }
    markActive(target);
    const shellReady=function(){
      if(!primary||!window.AQARI_V205)return true;
      return document.body?.getAttribute('data-v205-route')===target;
    };
    const routeReady=function(){return routeVisible(target)===true&&shellReady();};
    const verify=function(){
      if(routeReady()===false&&primary&&typeof stable==='function'&&runner!==stable){
        try{stable.call(window,target);runner=stable}catch(_error){}
      }else if(routeVisible(target)===false&&typeof current==='function'&&runner!==current){
        try{current.call(window,target);runner=current}catch(_error){}
      }
      requestAnimationFrame(function(){
        if(routeReady()===true)window.scrollTo({top:0,behavior:'auto'});
      });
    };
    if(result&&typeof result.then==='function')Promise.resolve(result).finally(function(){requestAnimationFrame(verify)});
    else requestAnimationFrame(verify);
    return result;`;
if(source.includes(oldBlock))source=source.replace(oldBlock,newBlock);
else if(!source.includes("const v205=primary&&window.AQARI_V205&&typeof window.AQARI_V205.navigate==='function'?window.AQARI_V205:null;"))throw Error('V267_OWNER_TEST_NAVIGATION_ANCHOR_MISSING');
if(source.includes("const runner=stableTargets.includes(target)&&typeof stable==='function'?stable:current;"))throw Error('V267_OWNER_TEST_STABLE_FIRST_NAVIGATION_REMAINS');
if(!source.includes("return document.body?.getAttribute('data-v205-route')===target;"))throw Error('V267_OWNER_TEST_SHELL_CONTEXT_GUARD_MISSING');
writeFileSync(navigationPath,source);
execFileSync(process.execPath,['--check','v199-ui.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-owner-test-navigation.test.mjs'],{stdio:'inherit'});
console.log('Installed V267 owner-test clear-section navigation fix for iPhone/iPad/Desktop.');
