// URLs remain valid only while their owning dialog and current record are open.
export function createPrivateUrls(dialog,urlAPI=URL){
 const urls=new Set();
 function clear(){for(const url of urls)urlAPI.revokeObjectURL(url);urls.clear();}
 dialog.onDispose(clear);
 return {
  clear,
  create(blob){dialog.session.check();if(dialog.closed)throw Error('SESSION_CHANGED');const url=urlAPI.createObjectURL(blob);urls.add(url);return url;},
  release(url){if(urls.delete(url))urlAPI.revokeObjectURL(url);}
 };
}
