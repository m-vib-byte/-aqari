import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

// Owner-test blocker fix only: primary sections must transition through the current
// V205 shell/router so the visible page and shell context agree. The preserved V199
// base router remains a fallback only. Once verified, align to the real destination.
const path=new URL('../v199-ui.js',import.meta.url);
let source=readFileSync(path,'utf8');
const oldRunner=`    const current=window.go;
    const stable=window.AQARI_V199_BASE_GO;
    const runner=stableTargets.includes(target)&&typeof stable==='function'?stable:current;
    let result;
    try{if(typeof runner==='function')result=runner.call(window,target);}
    catch(error){
      if(typeof current==='function'&&current!==runner)result=current.call(window,target);
      else throw error;
    }
    markActive(target);`;
const newRunner=`    const current=window.go;
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
    const routeReady=function(){return routeVisible(target)===true&&shellReady();};`;
if(source.includes(oldRunner))source=source.replace(oldRunner,newRunner);
else if(!source.includes("const v205=primary&&window.AQARI_V205&&typeof window.AQARI_V205.navigate==='function'?window.AQARI_V205:null;"))throw Error('V267_SECTION_CONTEXT_ROUTER_ANCHOR_MISSING');
const oldVerify=`    const verify=function(){
      if(routeVisible(target)===false&&typeof current==='function'&&current!==runner){
        try{current.call(window,target)}catch(_error){}
      }
      requestAnimationFrame(function(){
        if(routeVisible(target)===true)window.scrollTo({top:0,behavior:'auto'});
      });
    };`;
const newVerify=`    const verify=function(){
      if(routeReady()===false&&primary&&typeof stable==='function'&&runner!==stable){
        try{stable.call(window,target);runner=stable}catch(_error){}
      }else if(routeVisible(target)===false&&typeof current==='function'&&runner!==current){
        try{current.call(window,target);runner=current}catch(_error){}
      }
      requestAnimationFrame(function(){
        const page=routeNode(target);
        if(routeReady()===true&&page){
          if(typeof page.scrollIntoView==='function')page.scrollIntoView({block:'start',behavior:'auto'});
          else if(typeof window.scrollTo==='function'){
            const rect=page.getBoundingClientRect?.();
            const top=Math.max(0,(Number(rect?.top)||0)+(Number(window.scrollY)||0));
            window.scrollTo({top,behavior:'auto'});
          }
        }
      });
    };`;
if(source.includes(oldVerify))source=source.replace(oldVerify,newVerify);
else if(!source.includes("if(routeReady()===true&&page)"))throw Error('V267_SECTION_CONTEXT_VERIFY_ANCHOR_MISSING');
if(source.includes("const runner=stableTargets.includes(target)&&typeof stable==='function'?stable:current;"))throw Error('V267_SECTION_CONTEXT_STABLE_FIRST_REMAINS');
if(source.includes("window.scrollTo({top:0,behavior:'auto'});"))throw Error('V267_SECTION_TARGET_TOP_SCROLL_REMAINS');
if(!source.includes("return document.body?.getAttribute('data-v205-route')===target;"))throw Error('V267_SECTION_CONTEXT_GUARD_MISSING');
if(!source.includes("page.scrollIntoView({block:'start',behavior:'auto'})"))throw Error('V267_SECTION_TARGET_NAVIGATION_MISSING');
writeFileSync(path,source);
execFileSync(process.execPath,['--check','v199-ui.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-section-target-navigation.test.mjs'],{stdio:'inherit'});
console.log('Installed and verified V267 clear section-context navigation for the fixed trial domain.');
