import {node} from './dialog.js';
import {t} from './locale.js';

// Print high-resolution pages from the filled artifact, not the editor UI.
// A second tap prints synchronously if a browser suppresses the initial dialog.
export function appendContractPrint(target,{pageCount,renderPage}){
 const button=node('button',t('طباعة العقد')),status=node('p');button.type='button';button.className='aq267-pdf-print-button';status.setAttribute('role','status');target.append(button,status);
 let surface=null,controller=null,disposed=false,ready=false;const urls=[];
 const hidden=new Map();
 const beforePrint=()=>{if(!ready||!surface||!document.body.classList.contains('aq267-printing-contract'))return;for(const child of document.body.children){if(child===surface||hidden.has(child))continue;hidden.set(child,[child.style.getPropertyValue('display'),child.style.getPropertyPriority('display')]);child.style.setProperty('display','none','important');}};
 const afterPrint=()=>{for(const [child,[value,priority]] of hidden){if(value)child.style.setProperty('display',value,priority);else child.style.removeProperty('display');}hidden.clear();document.body.classList.remove('aq267-printing-contract');};window.addEventListener('beforeprint',beforePrint);window.addEventListener('afterprint',afterPrint);
 function clear(){surface?.remove();surface=null;ready=false;for(const url of urls)URL.revokeObjectURL(url);urls.length=0;afterPrint();}
 function print(){document.body.classList.add('aq267-printing-contract');status.textContent=t('إذا لم تظهر نافذة الطباعة، اضغط طباعة العقد مرة أخرى.');window.print();}
 button.onclick=()=>{
  if(disposed)return;if(ready){print();return;}if(controller)return;
  controller=new AbortController();const current=controller;button.disabled=true;status.textContent=t('جارٍ تجهيز جميع صفحات العقد للطباعة…');
  return (async()=>{
   const timeout=setTimeout(()=>current.abort(),120000);
   try{
    clear();surface=node('div');surface.className='aq267-pdf-print-surface';document.body.append(surface);
    for(let number=1;number<=pageCount;number++){
     const blob=await renderPage(number,current.signal);if(disposed||current.signal.aborted)return;if(blob.type.split(';')[0]!=='image/png')throw Error('INVALID_PRINT_PAGE');
     const url=URL.createObjectURL(blob);urls.push(url);const sheet=node('div'),image=node('img');sheet.className='aq267-pdf-print-sheet';image.alt=t('صفحة ')+number;image.src=url;sheet.append(image);surface.append(sheet);
     await image.decode();if(disposed||current.signal.aborted)return;status.textContent=t('تجهيز صفحة ')+number+t(' من ')+pageCount;
    }
    ready=true;print();
   }catch{if(!disposed){clear();status.textContent=t('تعذر تجهيز الطباعة. اضغط طباعة العقد لإعادة المحاولة.');}}
   finally{clearTimeout(timeout);controller=null;if(!disposed){button.disabled=false;if(current.signal.aborted){clear();status.textContent=t('انتهت مهلة تجهيز الطباعة. أعد المحاولة.');}}}
  })();
 };
 return {dispose(){disposed=true;controller?.abort();window.removeEventListener('beforeprint',beforePrint);window.removeEventListener('afterprint',afterPrint);clear();button.remove();status.remove();}};
}
