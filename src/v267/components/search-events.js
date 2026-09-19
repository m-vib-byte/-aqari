// Own only the dashboard search. Keep browser validation and one submit path.
export function installSearchEvents(root,{submit,shortcut,ready}){
 const listeners=[];
 const on=(type,fn)=>{root.addEventListener(type,fn,true);listeners.push([type,fn]);};
 on('click',event=>{
  const button=event.target?.closest?.('button');
  const form=button?.form;
  if(form?.id!=='aqExactHeroSearch'||button.type!=='submit'||button.disabled)return;
  event.preventDefault();event.stopImmediatePropagation();
  form.requestSubmit(button);
 });
 on('submit',event=>{
  if(event.target?.id!=='aqExactHeroSearch')return;
  event.preventDefault();event.stopImmediatePropagation();submit(event);
 });
 on('keydown',event=>{
  if(!(event.metaKey||event.ctrlKey)||String(event.key).toLowerCase()!=='k'||!ready())return;
  // Older shells also listen for this key and otherwise open multiple layers.
  event.preventDefault();event.stopImmediatePropagation();
  if(!event.repeat)shortcut();
 });
 return ()=>listeners.forEach(([type,fn])=>root.removeEventListener(type,fn,true));
}
