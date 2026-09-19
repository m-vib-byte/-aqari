// Delegate from the window so replacing a dashboard or menu cannot orphan its
// links, and older document-level routers cannot swallow current-shell actions.
export function installExactNavigationEvents(root,handle){
 const listener=event=>{
  const target=event.target?.nodeType===3?event.target.parentElement:event.target;
  const trigger=target?.closest?.('[data-exact-key],[data-exact-route],[data-exact-special],[data-exact-service]');
  if(!trigger||!trigger.closest('#aqOwnerExactShell,#aqOwnerExactHome,.aq-exact-section-head'))return;
  if(trigger.disabled||trigger.getAttribute?.('aria-disabled')==='true')return;
  event.preventDefault();event.stopImmediatePropagation();
  // Pass the stable control, rather than a child SVG that may be replaced.
  handle({target:trigger});
 };
 root.addEventListener('click',listener,true);
 return ()=>root.removeEventListener('click',listener,true);
}
