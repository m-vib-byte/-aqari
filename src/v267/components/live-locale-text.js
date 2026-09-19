// Track the last rendered value, not just the first source. Application updates
// must replace the source rather than restoring a stale loading/error message.
export function createLiveTextTranslator(translate) {
 const states=new WeakMap();
 return (owner,current)=>{
  const prior=states.get(owner);
  const source=prior&&current===prior.rendered?prior.source:current;
  const match=String(source).match(/^(\s*)([\s\S]*?)(\s*)$/);
  const rendered=match[1]+translate(match[2])+match[3];
  states.set(owner,{source,rendered});
  return rendered;
 };
}
