import {tokenizeTemplateText} from './rental-document-layout.js';

// This is a conservative editor estimate, not the PDF layout engine. Field
// tokens occupy their visible labels plus chip padding, never their hidden keys.
// Every break is a source offset: whitespace, tokens and Unicode remain intact.
const graphemes=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
const units=text=>graphemes?Array.from(graphemes.segment(text),part=>part.segment):Array.from(text);
function positiveInteger(value,name){
 if(typeof value!=='number'||!Number.isFinite(value)||value<1)throw new RangeError(name+' must be a positive number');
 return Math.floor(value);
}
function atomsFor(text,fields){
 const atoms=[];let offset=0;
 for(const token of tokenizeTemplateText(text,fields)){
  if(token.type==='field'){
   atoms.push({start:offset,end:offset+token.raw.length,label:String(token.label),chip:true});offset+=token.raw.length;
  }else for(const unit of units(token.text)){
   atoms.push({start:offset,end:offset+unit.length,newline:/^[\r\n]+$/.test(unit),space:/^[\t \r\n]+$/.test(unit)});offset+=unit.length;
  }
 }
 return atoms;
}
function advance(state,atom,columns){
 let {lines,column}=state;
 if(atom.newline)return {lines:lines+1,column:0};
 if(atom.chip){
  // An inline-block chip moves as one unit. A multi-line label occupies the
  // whole estimated width and cannot share its middle lines with other text.
  const labelLines=atom.label.split(/\r\n|\r|\n/),width=Math.min(columns,Math.max(...labelLines.map(line=>units(line).length))+2);
  const height=labelLines.reduce((total,line)=>total+Math.max(1,Math.ceil((units(line).length+2)/columns)),0);
  if(column&&column+width>columns){lines++;column=0;}
  return {lines:lines+height-1,column:column+width};
 }
 if(column>=columns){lines++;column=0;}
 return {lines,column:column+1};
}

export function templateTextLineCount(text,fields=[],columns=68){
 columns=positiveInteger(columns,'columns');let state={lines:1,column:0};
 for(const atom of atomsFor(text,fields))state=advance(state,atom,columns);
 return state.lines;
}

export function fragmentTemplateText(text,fields=[],{columns=68,lines=24}={}){
 columns=positiveInteger(columns,'columns');lines=positiveInteger(lines,'lines');
 const atoms=atomsFor(text,fields),fragments=[];let start=0;
 while(start<atoms.length){
  let state={lines:1,column:0},preferred=-1,end=start;
  for(;end<atoms.length;end++){
   const next=advance(state,atoms[end],columns);
   if(next.lines>lines){
    // A chip is indivisible even if its label alone exceeds a tiny budget.
    // It gets its own fragment, ensuring progress without losing token bytes.
    if(end===start){end++;break;}
    if(preferred>start&&preferred-start>=(end-start)/2)end=preferred;
    break;
   }
   state=next;if(atoms[end].space)preferred=end+1;
  }
  fragments.push(text.slice(atoms[start].start,atoms[end-1].end));start=end;
 }
 return fragments.length?fragments:[''];
}

/**
 * Partition display fragments using the editor's real, unscaled DOM height.
 * `measure(rawText, {firstFragment, pageOffset, sourceOffset})` must synchronously return the
 * height of that fragment, including its title/padding when firstFragment is
 * true. Measure in a probe with the same width, fonts and chips as the sheet.
 * sourceOffset is the raw UTF-16 start offset for applying source-indexed styles;
 * identical text on different pages must not be located with string searching.
 *
 * firstPageHeight is the remaining space on the current sheet; pageHeight is
 * the full usable height on following sheets. A first result at pageOffset 1
 * means the first source atom/title must start on the following sheet.
 *
 * This changes display only. Returned text joins to the exact original source;
 * no token, grapheme, whitespace, clause or stored presentation is rewritten.
 */
export function paginateTemplateTextMeasured(text,fields=[],{measure,firstPageHeight,pageHeight,tolerance=.25}={}){
 if(typeof measure!=='function')throw new TypeError('measure must be a function');
 for(const [name,value]of [['firstPageHeight',firstPageHeight],['pageHeight',pageHeight],['tolerance',tolerance]]){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||name==='pageHeight'&&value===0)throw new RangeError(name+' must be a finite valid height');
 }
 const atoms=atomsFor(text,fields),fragments=[];let start=0,pageOffset=0,previousFit=128;
 const measured=(raw,context)=>{const height=measure(raw,context);if(typeof height!=='number'||!Number.isFinite(height)||height<0)throw new RangeError('measure must return a finite nonnegative height');return height;};
 if(!atoms.length){
  let context={firstFragment:true,pageOffset,sourceOffset:0},height=measured('',context);
  if(height>firstPageHeight+tolerance&&firstPageHeight<pageHeight){pageOffset=1;context={firstFragment:true,pageOffset,sourceOffset:0};height=measured('',context);}
  return [{text:'',pageOffset,height,overflow:height>(pageOffset?pageHeight:firstPageHeight)+tolerance}];
 }
 while(start<atoms.length){
  const available=pageOffset?pageHeight:firstPageHeight,context={firstFragment:fragments.length===0,pageOffset,sourceOffset:atoms[start].start},cache=new Map();
  const source=end=>text.slice(atoms[start].start,atoms[end-1].end);
  const heightAt=end=>{if(!cache.has(end))cache.set(end,measured(source(end),context));return cache.get(end);};
  const fits=end=>heightAt(end)<=available+tolerance;
  if(!fits(start+1)){
   if(pageOffset===0&&available<pageHeight){pageOffset++;continue;}
   // An indivisible oversized field/grapheme remains visible and intact; the
   // caller can show an overflow warning instead of clipping or losing it.
   fragments.push({text:source(start+1),pageOffset,height:heightAt(start+1),overflow:true});start++;pageOffset++;continue;
  }
  // Exponential bracketing avoids measuring the whole remaining document on
  // every page. Binary search then finds the last fitting source-safe boundary.
  let low=start+1,step=Math.max(2,previousFit),high=Math.min(atoms.length,start+step);
  while(fits(high)){
   low=high;if(high===atoms.length)break;
   step*=2;high=Math.min(atoms.length,start+step);
  }
  if(low!==atoms.length){
   while(high-low>1){const middle=Math.floor((low+high)/2);if(fits(middle))low=middle;else high=middle;}
  }
  let end=low;
  if(end<atoms.length){
   // Prefer a nearby paragraph/word boundary without sacrificing a large part
   // of the sheet. Splitting a long unbroken word still uses grapheme offsets.
   const threshold=start+Math.ceil((end-start)*.9);let word=-1;
   for(let index=end-1;index>=threshold-1;index--){
    if(atoms[index].newline){end=index+1;word=-1;break;}
    if(word<0&&atoms[index].space)word=index+1;
   }
   if(word>start)end=word;
  }
  fragments.push({text:source(end),pageOffset,height:heightAt(end),overflow:false});previousFit=end-start;start=end;pageOffset++;
 }
 return fragments;
}
