import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {t} from '../src/v267/components/locale.js';

// Conservative inventory of literal UI call sites. This does not certify full
// platform coverage: templates, legacy index.html, portals and runtime errors
// require their own inventory and authenticated visual checks.
const root=fileURLToPath(new URL('../src/v267/pages/',import.meta.url));
const missing=new Map();let scanned=0;
for(const file of readdirSync(root).filter(name=>name.endsWith('.js')).sort()){
 scanned++;
 const source=readFileSync(root+file,'utf8');
 const literals=/(?:t\(|ui\('[^']+',|node\('[^']+',|field\(|createDialog\(|textContent\s*=|placeholder\s*=)(['"])([^'"\n]*[\u0600-\u06ff][^'"\n]*)\1/g;
 for(const match of source.matchAll(literals)){
  const text=match[2],languages=['en','hi','ur','ml'].filter(language=>t(text,language)===text);
  if(!languages.length)continue;
  const entry=missing.get(text)||{source:text,languages,files:[]};
  if(!entry.files.includes(file))entry.files.push(file);
  missing.set(text,entry);
 }
}
const summary={scanned_page_files:scanned,uncovered_literal_count:missing.size,scope:'Static literals in src/v267/pages only; not full-platform certification'};
console.log(JSON.stringify(process.argv.includes('--details')?{...summary,missing:[...missing.values()]}:summary,null,2));
if(process.argv.includes('--check')&&missing.size)process.exitCode=1;
