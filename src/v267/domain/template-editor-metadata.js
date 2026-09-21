// Optional, data-only editor settings. No HTML, CSS, remote font or image URL.
export const TEMPLATE_EDITOR_ROLES=Object.freeze(['owner','tenant','receiver','accountant']);
export const TEMPLATE_EDITOR_FONTS=Object.freeze(['sans','mono']);
export const templateFieldTokenPattern=/\{\{[^{}\r\n]*\}\}|\{\([^{}\r\n]*\}\}|\{\{[a-zA-Z0-9_ \t-]*(?:\}|(?=[^a-zA-Z0-9_ \t-]|$))|\{[a-zA-Z0-9_]+\}\}/g;
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v||{},k);
const fail=()=>{throw Error('بيانات تنسيق المحرر غير صالحة؛ راجع تنسيق النص ومواضع الفواصل.');};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const keys=(v,allowed,required=[])=>{if(!object(v)||Object.keys(v).some(k=>!allowed.includes(k))||required.some(k=>!own(v,k)))fail();};
const number=(v,min,max,integer=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||integer&&!Number.isInteger(v))fail();return Object.is(v,-0)?0:v;};
const bool=v=>{if(typeof v!=='boolean')fail();return v;};
const choice=(v,values)=>{if(!values.includes(v))fail();return v;};
const list=(v,max)=>{if(!Array.isArray(v)||v.length>max)fail();return v;};

export function isTemplateSourceBoundary(text,offset){
 if(typeof text!=='string'||!Number.isInteger(offset)||offset<0||offset>text.length)return false;
 if(offset&&offset<text.length&&/[\uD800-\uDBFF]/.test(text[offset-1])&&/[\uDC00-\uDFFF]/.test(text[offset]))return false;
 for(const match of text.matchAll(templateFieldTokenPattern))if(offset>match.index&&offset<match.index+match[0].length)return false;
 return true;
}

function style(value,range=false){
 const order=range?['font_family','font_pt','bold','underline']:['font_family','bold','underline','direction','paragraph_gap_mm','clause_before_mm','clause_after_mm','numbering'];
 keys(value,order);if(range&&!Object.keys(value).length)fail();const result={};
 for(const key of order)if(own(value,key)){
  const v=value[key];result[key]=key==='font_family'?choice(v,TEMPLATE_EDITOR_FONTS):key==='font_pt'?number(v,8,36):['bold','underline'].includes(key)?bool(v):key==='direction'?choice(v,['auto','rtl','ltr']):key==='numbering'?choice(v,['none','decimal']):number(v,0,key==='paragraph_gap_mm'?12:20);
 }
 return result;
}

/** Canonical key order is shared with Python. Absent optional groups stay absent.
 * Source ranges use UTF-16 offsets into raw clause title/text, not substituted
 * values. Source checks run whenever the template's clauses are supplied.
 */
export function validateTemplateEditor(value,fields=[],clauses){
 keys(value,['version','style','ranges','page_breaks','trailing_blank_pages','logo','signers'],['version']);if(value.version!==1)fail();
 const result={version:1};
 if(own(value,'style'))result.style=style(value.style);
 if(own(value,'ranges')){
  result.ranges=list(value.ranges,300).map(row=>{
   keys(row,['clause','part','start','end','style'],['clause','part','start','end','style']);
   const item={clause:number(row.clause,0,49,true),part:choice(row.part,['title','text']),start:number(row.start,0,60000,true),end:number(row.end,1,60000,true),style:style(row.style,true)};
   if(item.start>=item.end)fail();
   if(clauses!==undefined){const text=clauses?.[item.clause]?.[item.part];if(!isTemplateSourceBoundary(text,item.start)||!isTemplateSourceBoundary(text,item.end))fail();}
   return item;
  });
  const sorted=[...result.ranges].sort((a,b)=>a.clause-b.clause||a.part.localeCompare(b.part)||a.start-b.start);
  for(let i=1;i<sorted.length;i++){const a=sorted[i-1],b=sorted[i];if(a.clause===b.clause&&a.part===b.part&&a.end>b.start)fail();}
 }
 if(own(value,'page_breaks')){
  let previous=null;result.page_breaks=list(value.page_breaks,50).map(row=>{
   keys(row,['clause','offset'],['clause','offset']);const item={clause:number(row.clause,0,49,true),offset:number(row.offset,0,60000,true)};
   if(previous&&(item.clause<previous.clause||item.clause===previous.clause&&item.offset<=previous.offset))fail();
   if(clauses!==undefined&&!isTemplateSourceBoundary(clauses?.[item.clause]?.text,item.offset))fail();previous=item;return item;
  });
 }
 if(own(value,'trailing_blank_pages'))result.trailing_blank_pages=number(value.trailing_blank_pages,0,10,true);
 if(own(value,'logo')){
  const v=value.logo;keys(v,['x_mm','y_mm','width_mm','height_mm','repeat'],['x_mm','y_mm','width_mm','height_mm','repeat']);
  result.logo={x_mm:number(v.x_mm,8,190),y_mm:number(v.y_mm,8,281),width_mm:number(v.width_mm,12,100),height_mm:number(v.height_mm,8,60),repeat:choice(v.repeat,['first','all'])};
  if(result.logo.x_mm+result.logo.width_mm>202+1e-8||result.logo.y_mm+result.logo.height_mm>289+1e-8)fail();
 }
 if(own(value,'signers')){
  keys(value.signers,['order','details'],['order','details']);const order=list(value.signers.order,4).map(role=>choice(role,TEMPLATE_EDITOR_ROLES));if(new Set(order).size!==order.length)fail();
  keys(value.signers.details,TEMPLATE_EDITOR_ROLES);const details={};
  for(const role of TEMPLATE_EDITOR_ROLES)if(own(value.signers.details,role)){const flags=value.signers.details[role];keys(flags,['civil_id','nationality'],['civil_id','nationality']);details[role]={civil_id:bool(flags.civil_id),nationality:bool(flags.nationality)};}
  result.signers={order,details};
 }
 return result;
}
