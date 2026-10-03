import {node} from './dialog.js';
import {t} from './locale.js';

// Render the filled PDF on every device, without depending on a browser PDF plugin.
// URLs and requests are private to this preview and disposed when its values change.
export function appendPdfPagePreview(target,{pageCount,renderPage}){
 const root=node('section'),tools=node('div'),choice=node('select'),status=node('p'),viewport=node('div'),image=node('img'),zoomLabel=node('output');
 root.className='aq267-pdf-page-preview';tools.className='aq267-pdf-preview-tools';viewport.className='aq267-pdf-map-viewport';image.className='aq267-pdf-preview-image';image.draggable=false;
 choice.setAttribute('aria-label',t('صفحة المعاينة'));status.setAttribute('role','status');zoomLabel.setAttribute('aria-live','polite');
 for(let i=1;i<=pageCount;i++){const option=node('option',t('صفحة ')+i+t(' من ')+pageCount);option.value=String(i);choice.append(option);}choice.value='1';
 const button=(label,fn)=>{const b=node('button',t(label));b.type='button';b.onclick=fn;return b;};
 let page=1,zoom=1,version=0,controller=null,disposed=false;const urls=new Map();
 const previous=button('الصفحة السابقة',()=>load(page-1)),next=button('الصفحة التالية',()=>load(page+1)),retry=button('إعادة تحميل المعاينة',()=>load(page));retry.hidden=true;
 function setZoom(value){zoom=Math.max(1,Math.min(4,value));image.style.width=(zoom*100)+'%';zoomLabel.textContent=Math.round(zoom*100)+'%';}
 tools.append(previous,choice,next,button('تصغير المعاينة −',()=>setZoom(zoom-.5)),zoomLabel,button('تكبير المعاينة +',()=>setZoom(zoom+.5)),button('ملاءمة المعاينة للشاشة',()=>setZoom(1)));
 viewport.append(image);root.append(tools,status,retry,viewport);target.append(root);setZoom(1);
 function failed(){image.removeAttribute('src');status.textContent=t('تعذر عرض الصفحة. اضغط إعادة تحميل المعاينة.');retry.hidden=false;}
 image.onload=()=>{if(!disposed){status.textContent=t('صفحة ')+page+t(' من ')+pageCount;}};
 image.onerror=()=>{if(!disposed){const url=urls.get(page);if(url)URL.revokeObjectURL(url);urls.delete(page);failed();}};
 async function load(number){
  if(disposed||number<1||number>pageCount)return;
  controller?.abort();controller=new AbortController();const current=controller,ticket=++version;page=number;choice.value=String(page);previous.disabled=page===1;next.disabled=page===pageCount;retry.hidden=true;
  image.removeAttribute('src');image.alt=t('معاينة العقد المعبأ — صفحة ')+page;status.textContent=t('جارٍ عرض صفحة العقد…');viewport.scrollTop=0;viewport.scrollLeft=0;
  const timer=setTimeout(()=>current.abort(),45000);
  try{
   let url=urls.get(page);
   if(!url){const blob=await renderPage(page,current.signal);if(disposed||ticket!==version||current.signal.aborted)return;if(blob.type.split(';')[0]!=='image/png')throw Error('INVALID_PREVIEW');url=URL.createObjectURL(blob);urls.set(page,url);}
   if(!disposed&&ticket===version)image.src=url;
  }catch{if(!disposed&&ticket===version)failed();}
  finally{clearTimeout(timer);if(!disposed&&ticket===version&&current.signal.aborted)failed();}
 }
 choice.onchange=()=>load(Number(choice.value));
 const ready=load(1);
 return {root,image,ready,dispose(){disposed=true;version++;controller?.abort();image.onload=null;image.onerror=null;image.removeAttribute('src');for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();root.remove();}};
}
