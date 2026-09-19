// A slow page download must not open a dialog after a newer destination wins.
let generation=0;
export function cancelPendingNavigation(){generation++;}
if(typeof window!=='undefined'){
 window.addEventListener('aqari:navigation-start',cancelPendingNavigation);
 window.addEventListener('aqari:auth-boundary',cancelPendingNavigation);
}
export async function guardPageImport(load){
 const ticket=++generation;
 const page=await load();
 if(ticket!==generation)throw Error('NAVIGATION_SUPERSEDED');
 return page;
}
