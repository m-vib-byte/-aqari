import {templateFieldTokenPattern,validateTemplateEditor} from './template-editor-metadata.js';

const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const ordered=ranges=>ranges.sort((a,b)=>a.clause-b.clause||(a.part==='title'?0:1)-(b.part==='title'?0:1)||a.start-b.start);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sameStyle=(a,b)=>same(Object.entries(a).sort(([a],[b])=>a.localeCompare(b)),Object.entries(b).sort(([a],[b])=>a.localeCompare(b)));
const boundaryTable=text=>{
 const valid=new Uint8Array(text.length+1);valid.fill(1);
 for(let i=1;i<text.length;i++)if(/[\uD800-\uDBFF]/.test(text[i-1])&&/[\uDC00-\uDFFF]/.test(text[i]))valid[i]=0;
 for(const match of text.matchAll(templateFieldTokenPattern))valid.fill(0,match.index+1,match.index+match[0].length);
 return valid;
};

/** Rebase optional display metadata after one real plain-text edit. */
export function remapTemplateEditorText(editor,{clause,part='text',before,after}){
 if(editor===undefined||editor===null)return editor;
 const result=copy(editor);if(before===after)return result;
 if(typeof before!=='string'||typeof after!=='string')throw new TypeError('Source text must be a string');
 const beforeBoundary=boundaryTable(before),afterBoundary=boundaryTable(after);
 let start=0,oldEnd=before.length,newEnd=after.length;
 while(start<Math.min(before.length,after.length)&&before[start]===after[start])start++;
 while(start>0&&(!beforeBoundary[start]||!afterBoundary[start]))start--;
 while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
 while((!beforeBoundary[oldEnd]||!afterBoundary[newEnd])&&oldEnd<before.length&&newEnd<after.length){oldEnd++;newEnd++;}
 if(!beforeBoundary[oldEnd]||!afterBoundary[newEnd]){oldEnd=before.length;newEnd=after.length;}
 const delta=newEnd-oldEnd;
 if(result.ranges)result.ranges=result.ranges.flatMap(range=>{
  if(range.clause!==clause||range.part!==part)return [range];
  let {start:a,end:b}=range;
  if(b<=start)return [range];
  if(a>=oldEnd){a+=delta;b+=delta;}
  else if(a<start&&b>oldEnd)b+=delta;
  else if(a<start)b=start;
  else if(b>oldEnd){a=newEnd;b+=delta;}
  else return [];
  return a<b&&afterBoundary[a]&&afterBoundary[b]?[{...range,start:a,end:b}]:[];
 });
 if(part==='text'&&result.page_breaks){
  result.page_breaks=result.page_breaks.flatMap(point=>{
   if(point.clause!==clause||point.offset<=start)return [point];
   const offset=point.offset>=oldEnd?point.offset+delta:start;
   return afterBoundary[offset]?[{...point,offset}]:[];
  }).filter((point,index,all)=>!all.slice(0,index).some(other=>other.clause===point.clause&&other.offset===point.offset));
 }
 return result;
}

/** oldToNew is an array keyed by old index; null/undefined removes that clause. */
export function remapTemplateEditorClauses(editor,oldToNew){
 if(editor===undefined||editor===null)return editor;
 const result=copy(editor),index=old=>{const next=oldToNew?.[old];return Number.isInteger(next)&&next>=0&&next<50?next:null;};
 if(result.ranges)result.ranges=ordered(result.ranges.flatMap(range=>index(range.clause)===null?[]:[{...range,clause:index(range.clause)}]));
 if(result.page_breaks)result.page_breaks=result.page_breaks.flatMap(point=>index(point.clause)===null?[]:[{...point,clause:index(point.clause)}]).sort((a,b)=>a.clause-b.clause||a.offset-b.offset);
 return result;
}

/** Overlay a selected style without overlapping ranges or changing source text. */
export function setTemplateRangeStyle(editor,{clause,part='text',start,end,style},clauses){
 const result=copy(editor||{version:1}),candidate={clause,part,start,end,style:copy(style)};
 validateTemplateEditor({version:1,ranges:[candidate]},[],clauses);
 const existing=result.ranges||[],matching=existing.filter(range=>range.clause===clause&&range.part===part),points=new Set([start,end]);
 for(const range of matching)if(range.start<end&&range.end>start){points.add(Math.max(start,range.start));points.add(Math.min(end,range.end));}
 const ranges=existing.flatMap(range=>{
  if(range.clause!==clause||range.part!==part||range.end<=start||range.start>=end)return [range];
  return [...(range.start<start?[{...range,end:start}]:[]),...(range.end>end?[{...range,start:end}]:[])];
 });
 const bounds=[...points].sort((a,b)=>a-b);
 for(let i=1;i<bounds.length;i++){
  const a=bounds[i-1],b=bounds[i],prior=matching.find(range=>range.start<=a&&range.end>=b);
  ranges.push({clause,part,start:a,end:b,style:{...prior?.style,...style}});
 }
 result.ranges=[];
 for(const range of ordered(ranges)){
  const previous=result.ranges.at(-1);
  if(previous&&previous.clause===range.clause&&previous.part===range.part&&previous.end===range.start&&sameStyle(previous.style,range.style))previous.end=range.end;
  else result.ranges.push(range);
 }
 return validateTemplateEditor(result,[],clauses);
}

/** Undo/redo holds editor content snapshots only; it never writes or approves. */
export function createTemplateEditorHistory(initial,{limit=60}={}){
 if(!Number.isInteger(limit)||limit<2||limit>200)throw new RangeError('History limit must be between 2 and 200');
 let items=[copy(initial)],position=0;
 return {
  get canUndo(){return position>0;},get canRedo(){return position<items.length-1;},
  push(snapshot){const value=copy(snapshot);if(same(items[position],value))return false;items=items.slice(0,position+1);items.push(value);if(items.length>limit)items.shift();position=items.length-1;return true;},
  undo(){if(position===0)return null;return copy(items[--position]);},
  redo(){if(position===items.length-1)return null;return copy(items[++position]);},
  reset(snapshot){items=[copy(snapshot)];position=0;},
 };
}
