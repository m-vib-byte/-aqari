export function normalizeOwnerCssReference(source){
 return source.replace(/(?<![\w$.])(?:globalThis\.)*CSS\?\.escape\?\./g,'globalThis.CSS?.escape?.');
}
