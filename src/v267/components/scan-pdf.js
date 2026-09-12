// Image-only PDF. Only JPEGs produced by our canvas scanner enter this writer.
// Text recognition and signature verification are deliberately separate operations.
export const MAX_SCAN_PAGES=20;
export const MAX_SCAN_BYTES=25*1024*1024;
export async function scanPdf(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>MAX_SCAN_PAGES)throw Error('أضف من صفحة إلى ٢٠ صفحة للمستند.');
 const parts=[],offsets=[0];let size=0;
 const put=part=>{const value=typeof part==='string'?new TextEncoder().encode(part):part;parts.push(value);size+=value.byteLength;if(size>MAX_SCAN_BYTES)throw Error('حجم المستند يتجاوز ٢٥ ميجابايت. قسم الصفحات إلى أكثر من مستند.');};
 const object=(id,body)=>{offsets[id]=size;put(id+' 0 obj\n');put(body);put('\nendobj\n');};
 put('%PDF-1.4\n');put(new Uint8Array([37,226,227,207,211,10]));
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
 for(let i=0;i<pages.length;i++){
  const {blob,width,height}=pages[i];
  if(blob?.type!=='image/jpeg'||blob.size<4||blob.size>8*1024*1024||![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=2400))throw Error('راجع صورة الصفحة قبل تجهيز PDF.');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw Error('صورة الصفحة غير صالحة.');
  const landscape=width>height,pw=landscape?842:595,ph=landscape?595:842,scale=Math.min(pw/width,ph/height),w=+(width*scale).toFixed(3),h=+(height*scale).toFixed(3),x=+((pw-w)/2).toFixed(3),y=+((ph-h)/2).toFixed(3),id=3+i*3;
  object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Scan ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
  offsets[id+1]=size;put(`${id+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);put(bytes);put('\nendstream\nendobj\n');
  const commands=`q\n${w} 0 0 ${h} ${x} ${y} cm\n/Scan Do\nQ\n`;
  object(id+2,`<< /Length ${commands.length} >>\nstream\n${commands}endstream`);
 }
 const start=size;put(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
 for(const offset of offsets.slice(1))put(String(offset).padStart(10,'0')+' 00000 n \n');
 put(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
 return new Blob(parts,{type:'application/pdf'});
}
