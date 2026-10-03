// Isolated browser-test instrumentation only. Never imported by production UI.
export function installHomeResponsivenessDiagnostics(){
 const nativeTimeout=window.setTimeout,nativeInterval=window.setInterval;
 const timers=[],events=[];let mutationBatches=0,mutations=0;
 const bounded=(list,item)=>{list.push(item);if(list.length>100)list.shift();};
 const record=type=>bounded(events,{type,at:performance.now(),visibility:document.visibilityState,beats:window.__homeHeartbeats});
 for(const event of ['DOMContentLoaded','load','pageshow','pagehide','visibilitychange'])window.addEventListener(event,()=>record(event));
 const wrap=(native,kind)=>function(callback,delay,...args){
  if(typeof callback!=='function')return native.call(this,callback,delay,...args);
  const origin=new Error().stack?.split('\n').slice(2,5).join('\n'),label=String(callback).slice(0,150);let expected=performance.now()+Math.max(0,Number(delay)||0);
  return native.call(this,function(...values){const start=performance.now(),late=start-expected;
   try{return callback.apply(this,values);}finally{const end=performance.now(),duration=end-start;if(duration>50||late>500)bounded(timers,{kind,at:start,duration,late,delay:Number(delay)||0,label,origin});expected=end+Math.max(0,Number(delay)||0);}
  },delay,...args);
 };
 window.setTimeout=wrap(nativeTimeout,'timeout');window.setInterval=wrap(nativeInterval,'interval');
 new MutationObserver(records=>{mutationBatches++;mutations+=records.length;}).observe(document,{subtree:true,childList:true,attributes:true,characterData:true});
 const read=()=>({timeOrigin:performance.timeOrigin,at:performance.now(),wall:Date.now(),beats:window.__homeHeartbeats,visibility:document.visibilityState,readyState:document.readyState,mutationBatches,mutations,timers:[...timers],events:[...events],navigation:performance.getEntriesByType('navigation').map(x=>({type:x.type,domContentLoadedEventEnd:x.domContentLoadedEventEnd,loadEventEnd:x.loadEventEnd})),sourceCount:document.scripts.length});
 window.__homeDiagnostics={read};record('installed');
}
