import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const marker='<style data-aqari-unified-source="/v267-unified.css">';

// Keep the reviewed stylesheet authoritative without changing surrounding
// markup, scripts, data or any other style block in the app entry.
export function synchronizeUnifiedStyleHtml(html,css){
 if(typeof html!=='string'||typeof css!=='string'||!css.trim()||/<\/style\s*>/i.test(css))throw Error('INVALID_UNIFIED_STYLE_SOURCE');
 const start=html.indexOf(marker);
 if(start<0||html.indexOf(marker,start+marker.length)>=0)throw Error('UNIFIED_STYLE_BLOCK_NOT_UNIQUE');
 const contentStart=start+marker.length,end=html.indexOf('</style>',contentStart);
 if(end<0)throw Error('UNIFIED_STYLE_BLOCK_UNCLOSED');
 return html.slice(0,contentStart)+'\n'+css+'\n'+html.slice(end);
}

export function synchronizeUnifiedStyles({htmlPath=new URL('../index.html',import.meta.url),cssPath=new URL('../v267-unified.css',import.meta.url)}={}){
 const current=readFileSync(htmlPath,'utf8'),next=synchronizeUnifiedStyleHtml(current,readFileSync(cssPath,'utf8'));
 if(next===current)return false;
 writeFileSync(htmlPath,next);return true;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 console.log(synchronizeUnifiedStyles()?'Synchronized the approved V267 stylesheet into its existing app block.':'V267 inline stylesheet is already current.');
}
