import {node} from './dialog.js';
import {t} from './locale.js';

// Reuse the verified private blob. The caller owns its lifetime and revocation.
// Touch browsers can clip embedded PDFs to page one; use their full PDF viewer.
export function appendPdfViewer(target,url,{title='PDF',filename='document.pdf',frameClass='',onOpen=()=>{},embed=true,downloadLabel='تحميل ملف PDF الأصلي'}={}){
 const open=node('a',t('فتح جميع صفحات PDF في تبويب مستقل'));
 open.href=url;open.target='_blank';open.rel='noopener noreferrer';open.onclick=onOpen;
 const download=node('a',t(downloadLabel));
 download.href=url;download.download=String(filename).replace(/[\\/]/g,'_');
 for(const link of [open,download]){link.style.display='block';link.style.padding='14px';link.style.marginBlock='10px';link.style.overflowWrap='anywhere';}
 target.append(open,download);
 const touch=typeof globalThis.matchMedia==='function'&&globalThis.matchMedia('(any-pointer: coarse)').matches;
 let frame=null;
 if(embed&&!touch){frame=node('iframe');frame.title=title;frame.className=frameClass;frame.src=url;frame.style.cssText='width:100%;height:75vh;border:1px solid #d8c8ae';target.append(frame);}
 return {open,download,frame};
}
