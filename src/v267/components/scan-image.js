export const MAX_SOURCE_BYTES=25*1024*1024;
export function scanGeometry(width,height,rotation=0,crop={top:0,bottom:0,left:0,right:0}){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width*height>80000000)throw Error('حجم الصورة غير مناسب. التقط صورة بدقة أقل.');
 if(![0,90,180,270].includes(rotation))throw Error('تدوير غير صالح.');
 for(const edge of ['top','bottom','left','right'])if(!Number.isFinite(crop[edge])||crop[edge]<0||crop[edge]>40)throw Error('قص غير صالح.');
 const sx=Math.round(width*crop.left/100),sy=Math.round(height*crop.top/100),sw=Math.max(1,Math.round(width*(100-crop.left-crop.right)/100)),sh=Math.max(1,Math.round(height*(100-crop.top-crop.bottom)/100));
 const turn=rotation%180!==0,scale=Math.min(1,2400/Math.max(sw,sh));
 return {sx,sy,sw,sh,width:Math.max(1,Math.round((turn?sh:sw)*scale)),height:Math.max(1,Math.round((turn?sw:sh)*scale)),rotation};
}
export async function decodeImage(file){
 if(!file||file.size<=0||file.size>MAX_SOURCE_BYTES||!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type))throw Error('اختر صورة مستند بحجم لا يتجاوز ٢٥ ميجابايت.');
 const url=URL.createObjectURL(file),img=new Image();img.decoding='async';
 try{img.src=url;await img.decode();scanGeometry(img.naturalWidth,img.naturalHeight);return img;}catch{throw Error('تعذر قراءة الصورة. التقطها بالكاميرا أو اختر JPEG.');}finally{URL.revokeObjectURL(url);}
}
export async function renderScan(img,rotation,crop){
 const g=scanGeometry(img.naturalWidth,img.naturalHeight,rotation,crop),canvas=document.createElement('canvas');canvas.width=g.width;canvas.height=g.height;
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('تعذر تجهيز صورة المستند.');ctx.fillStyle='#fff';ctx.fillRect(0,0,g.width,g.height);ctx.translate(g.width/2,g.height/2);ctx.rotate(rotation*Math.PI/180);const turn=rotation%180!==0,dw=turn?g.height:g.width,dh=turn?g.width:g.height;ctx.drawImage(img,g.sx,g.sy,g.sw,g.sh,-dw/2,-dh/2,dw,dh);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));canvas.width=1;canvas.height=1;
 if(!blob||blob.type!=='image/jpeg'||blob.size>8*1024*1024)throw Error('تعذر ضغط الصورة. التقط صورة جديدة.');
 return blob;
}
export async function checksum(blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');}
