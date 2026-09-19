// Keep native click/keyboard routing and authorization as the single action path.
export function installTouchNavigation(root, now=()=>Date.now()) {
 let gesture=null, recent=null;
 const listeners=[];
 const target=event=>{
  const button=event.target?.closest?.('button');
  return button?.closest?.('#aqOwnerExactShell,#aqOwnerExactHome,.aq-exact-section-head,#aq267-service-dialog,.aq267-contracts,.aq267-dialog')&&!button.disabled?button:null;
 };
 const on=(name,handler)=>{root.addEventListener(name,handler,true);listeners.push([name,handler]);};
 on('pointerdown',event=>{
  gesture=null;
  if(event.pointerType!=='touch'||event.isPrimary===false)return;
  const button=target(event);
  if(button)gesture={button,id:event.pointerId,x:event.clientX,y:event.clientY,time:now()};
 });
 on('pointermove',event=>{
  if(gesture&&event.pointerId===gesture.id&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>10)gesture=null;
 });
 on('pointercancel',()=>{gesture=null;});
 on('scroll',()=>{gesture=null;});
 on('pointerup',event=>{
  const tap=gesture;gesture=null;
  if(!tap||event.pointerId!==tap.id||target(event)!==tap.button||now()-tap.time>500||Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>10)return;
  recent={button:tap.button,time:now()};
  event.preventDefault();
  tap.button.click();
 });
 // Window capture runs before existing document routers. Only consume the
 // browser's duplicate click; programmatic and keyboard activation still work.
 on('click',event=>{
  const button=event.target?.closest?.('button');
  if(recent&&event.isTrusted&&event.detail!==0&&now()-recent.time<=800&&button===recent.button){
   recent=null;event.preventDefault();event.stopImmediatePropagation();return;
  }
  // Shared V267 dialog actions run before legacy document routers.
  // Form submit/reset controls retain native validation and default behavior.
  const owned=button?.closest?.('#aq267-service-dialog[open],.aq267-contracts[open]')||
   (button?.closest?.('.aq267-dialog[open]')&&(!button.form||button.type==='button'));
  if(owned&&!button.disabled&&typeof button.onclick==='function'){
   event.preventDefault();event.stopImmediatePropagation();button.onclick.call(button,event);
  }
 });
 return ()=>{for(const [name,handler] of listeners)root.removeEventListener(name,handler,true);gesture=null;recent=null;};
}
