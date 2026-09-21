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
