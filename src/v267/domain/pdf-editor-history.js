// Memory only: history must not persist tenant data in browser storage.
export function createPdfEditorHistory(initial,{limit=100,maxBytes=5*1024*1024,groupMs=750}={}){
 const copy=value=>JSON.parse(JSON.stringify(value));
 const key=value=>JSON.stringify([value.mapping,value.values]);
 const frame=value=>{const data=copy(value);return {data,key:key(data),bytes:JSON.stringify(data).length*2};};
 let frames=[frame(initial)],index=0,group='',lastAt=0;
 function record(value,{group:nextGroup='',now=Date.now()}={}){
  const next=frame(value);if(next.key===frames[index].key)return false;
  const merge=!!nextGroup&&group===nextGroup&&index===frames.length-1&&index>0&&now-lastAt>=0&&now-lastAt<=groupMs;
  frames.splice(index+1);
  if(merge)frames[index]=next;else{frames.push(next);index++;}
  group=nextGroup;lastAt=now;
  let bytes=frames.reduce((sum,item)=>sum+item.bytes,0);
  while(frames.length>1&&(frames.length>limit||bytes>maxBytes)){bytes-=frames.shift().bytes;index--;}
  return true;
 }
 function step(delta){const target=index+delta;if(target<0||target>=frames.length)return null;index=target;group='';return copy(frames[index].data);}
 return {record,undo:()=>step(-1),redo:()=>step(1),get canUndo(){return index>0;},get canRedo(){return index<frames.length-1;},clear(){frames=[];index=-1;group='';}};
}
