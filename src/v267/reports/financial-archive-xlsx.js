// Browser-only, bounded OOXML export of the authorized archive readback.
// No network, formulas, macros, external relationships or new accounting totals.
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const LIMIT=16*1024*1024;
const encoder=new TextEncoder();
export const ARCHIVE_XLSX_TYPE='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function text(value){
 if(value!==null&&value!==undefined&&typeof value!=='string'&&typeof value!=='number')throw Error('تعذر تصدير قيمة غير صالحة في السجل.');
 const s=String(value??'');
 if(s.length>32767||/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(s))throw Error('يتضمن السجل نصاً يتجاوز حدود Excel أو أحرفاً غير صالحة.');
 // Escape literal OOXML escape sequences before XML encoding; do not alter identifiers.
 return s.replace(/_x[0-9a-f]{4}_/gi,m=>'_x005F_'+m.slice(1)).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll('\r','&#13;');
}
function label(ref,value,style=0){return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${text(value)}</t></is></c>`;}
function amount(value){
 if(!['string','number'].includes(typeof value)||!/^\d+(?:\.\d{1,3})?$/.test(String(value)))throw Error('تعذر تصدير مبلغ مفقود أو غير صالح.');
 const [whole,fraction='']=String(value).split('.'),fils=BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0'));
 if(fils>999999999999999n)throw Error('المبلغ يتجاوز دقة Excel؛ استخدم السجل الخام للتدقيق.');
 return `${fils/1000n}.${String(fils%1000n).padStart(3,'0')}`;
}
function excelDate(value,month){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.slice(0,7)!==month)throw Error('تعذر تصدير تاريخ خارج شهر التقرير.');
 const date=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value||value<'1900-01-01')throw Error('تعذر تصدير تاريخ غير صالح في السجل.');
 return (date.getTime()-Date.UTC(1899,11,31))/86400000+(value>='1900-03-01'?1:0);
}
function sheet(rows,widths,{filter=false}={}){
 return XML+`<worksheet xmlns="${NS}"><dimension ref="A1:${String.fromCharCode(64+widths.length)}${rows.length}"/><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="32"/><cols>`+
 widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')+`</cols><sheetData>${rows.map((r,i)=>`<row r="${i+1}">${r}</row>`).join('')}</sheetData>`+
 (filter?`<autoFilter ref="A1:H${rows.length}"/>`:'')+`<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape"/></worksheet>`;
}
// ZIP STORE: bounded output, fixed part names, UTF-8, CRC32 and central directory.
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const byte of bytes)n=crcTable[(n^byte)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function zip(files){
 const local=[],central=[];let offset=0,total=22;
 for(const [path,value] of files){
  const name=encoder.encode(path),data=encoder.encode(value),sum=crc(data),head=new Uint8Array(30+name.length),h=new DataView(head.buffer);
  total+=76+2*name.length+data.length;if(total>LIMIT)throw Error('حجم تقرير Excel كبير؛ قلّل النتائج باستخدام البحث أو مرشحات الحركات.');
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,sum,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);head.set(name,30);
  const tail=new Uint8Array(46+name.length),t=new DataView(tail.buffer);
  t.setUint32(0,0x02014b50,true);t.setUint16(4,20,true);t.setUint16(6,20,true);t.setUint16(8,0x800,true);t.setUint16(14,33,true);t.setUint32(16,sum,true);t.setUint32(20,data.length,true);t.setUint32(24,data.length,true);t.setUint16(28,name.length,true);t.setUint32(42,offset,true);tail.set(name,46);
  local.push(head,data);central.push(tail);offset+=head.length+data.length;
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,central.reduce((n,b)=>n+b.length,0),true);e.setUint32(16,offset,true);
 const out=new Uint8Array(total);let cursor=0;for(const part of [...local,...central,end]){out.set(part,cursor);cursor+=part.length;}return out;
}
const styles=XML+`<styleSheet xmlns="${NS}"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.000"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF153F49"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4">`+
 [[0,0,0],[0,1,2],[164,0,0],[165,0,0]].map(([num,font,fill])=>`<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="0" xfId="0" applyAlignment="1" applyNumberFormat="1" applyFont="1" applyFill="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf>`).join('')+`</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function createArchiveXlsx({month,workspace,retrievedAt,columns,rows,filters,period,totalRows}){
 if(typeof month!=='string'||!/^(?:19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])$/.test(month)||typeof workspace!=='string'||!workspace||!Number.isFinite(Date.parse(retrievedAt)))throw Error('تعذر التحقق من هوية تقرير Excel.');
 if(!Array.isArray(columns)||columns.length!==8||!Array.isArray(rows)||!Number.isSafeInteger(totalRows)||totalRows<rows.length)throw Error('تعذر التحقق من حركات التقرير.');
 if(rows.length>10000)throw Error('تجاوز التقرير ١٠ آلاف حركة؛ قلّل النتائج باستخدام المرشحات.');
 const header=columns.map((v,i)=>label(String.fromCharCode(65+i)+'1',v,1)).join('');let contentLength=header.length;
 const body=rows.map((r,index)=>{
  if(!Array.isArray(r)||r.length!==8)throw Error('تعذر التحقق من أعمدة الحركة.');
  const n=index+2;
  const xml=r.map((v,i)=>{const ref=String.fromCharCode(65+i)+n;return i===0?`<c r="${ref}" s="3"><v>${excelDate(v,month)}</v></c>`:i===4?`<c r="${ref}" s="2"><v>${amount(v)}</v></c>`:label(ref,v);}).join('');
  contentLength+=xml.length;if(contentLength>LIMIT)throw Error('حجم تقرير Excel كبير؛ قلّل النتائج باستخدام المرشحات.');return xml;
 });
 const metadata=[['بيانات التقرير','القيمة'],['الشهر',month],['مساحة العمل',workspace],['وقت الاسترجاع بالتوقيت العالمي',retrievedAt],['الحركات المصدرة',String(rows.length)],['حركات الشهر المعادة قبل التصفية',String(totalRows)],['البحث',filters?.search||'دون بحث'],['الحالة',filters?.status||'كل الحالات'],['نوع الحركة',filters?.stream||'كل الحركات'],['حالة الفترة',period?'مقفلة':'غير مقفلة'],['وقت الإقفال',period?.closed_at||'غير متاح'],['نطاق التقرير','الحركات المطابقة للمرشحات من القراءة المحكومة للشهر؛ لا يمثل صافي ربح أو دفتر حسابات موحداً.'],['المجاميع','لم تجمع الأنواع والاتجاهات المختلفة. الملغى والافتتاحي وتخصيص الرصيد تبقى مميزة ولا تعد تحصيلاً جديداً.'],['لقطة الإقفال','هذا تنزيل للحركات المسترجعة. ملخص لقطة الإقفال وسجل التدقيق موجودان في تنزيل السجل للتدقيق.']];
 const files=[
  ['[Content_Types].xml',XML+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
  ['_rels/.rels',XML+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
  ['xl/workbook.xml',XML+`<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets><sheet name="الحركات" sheetId="1" r:id="rId1"/><sheet name="بيانات التقرير" sheetId="2" r:id="rId2"/></sheets></workbook>`],
  ['xl/_rels/workbook.xml.rels',XML+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${REL}/styles" Target="styles.xml"/></Relationships>`],
  ['xl/styles.xml',styles],['xl/worksheets/sheet1.xml',sheet([header,...body],[16,24,30,20,22,18,28,60],{filter:true})],['xl/worksheets/sheet2.xml',sheet(metadata.map((r,i)=>r.map((v,j)=>label(String.fromCharCode(65+j)+(i+1),v,i===0?1:0)).join('')),[38,100])]
 ];
 return zip(files);
}
