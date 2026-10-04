const epsilon=.000001;
const overlaps=(a,b)=>a.page===b.page&&Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>.00001&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>.00001;
export function validPdfFieldPosition(fields,field){
 return field.x>=0&&field.y>=0&&field.x+field.width<=1+epsilon&&field.y+field.height<=1+epsilon&&!fields.some(other=>other.id!==field.id&&overlaps(field,other));
}
export function duplicatePdfField(fields,source,id){
 if(fields.length>=100)throw Error('PDF_FIELD_LIMIT');
 const copy={...source,id,label:(source.label.slice(0,94)+' — نسخ').slice(0,100)};
 delete copy.dataKey;delete copy.locked;
 const pageFields=fields.filter(field=>field.page===source.page),gap=.008;
 const xs=[source.x,0,1-source.width],ys=[source.y,0,1-source.height];
 for(const field of pageFields){xs.push(field.x+field.width+gap,field.x-source.width-gap);ys.push(field.y+field.height+gap,field.y-source.height-gap);}
 const candidates=[];
 for(const x of new Set(xs))for(const y of new Set(ys)){
  const field={...copy,x,y};if(validPdfFieldPosition(fields,field))candidates.push(field);
 }
 candidates.sort((a,b)=>(a.x-source.x)**2+(a.y-source.y)**2-((b.x-source.x)**2+(b.y-source.y)**2));
 if(!candidates.length)throw Error('PDF_FIELD_NO_SPACE');
 return candidates[0];
}
export function alignPdfField(fields,source,reference,mode){
 if(source.locked)throw Error('PDF_FIELD_LOCKED');
 if(!reference||source.id===reference.id||source.page!==reference.page)throw Error('PDF_FIELD_REFERENCE');
 const field={...source};
 if(mode==='left')field.x=reference.x;
 else if(mode==='right')field.x=reference.x+reference.width-field.width;
 else if(mode==='top')field.y=reference.y;
 else if(mode==='bottom')field.y=reference.y+reference.height-field.height;
 else if(mode==='size'){field.width=reference.width;field.height=reference.height;}
 else throw Error('PDF_FIELD_REFERENCE');
 if(!validPdfFieldPosition(fields,field))throw Error('PDF_FIELD_PLACEMENT');
 return field;
}
