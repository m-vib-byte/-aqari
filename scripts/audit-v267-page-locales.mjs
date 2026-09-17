import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {hasTranslation} from '../src/v267/components/locale.js';

// Conservative inventory of literal UI call sites. This does not certify full
// platform coverage: templates, legacy index.html, portals and runtime errors
// require their own inventory and authenticated visual checks.
const root=fileURLToPath(new URL('../src/v267/pages/',import.meta.url));
const missing=new Map(),unclassified=new Map();let scanned=0;
for(const file of readdirSync(root).filter(name=>name.endsWith('.js')).sort()){
 scanned++;
 const source=readFileSync(root+file,'utf8');
 const literals=/(?:translateStatic\(|t\(|ui\('[^']+',|node\('[^']+',|field\(|createDialog\(|textContent\s*=|placeholder\s*=)(['"])([^'"\n]*[\u0600-\u06ff][^'"\n]*)\1/g;
 for(const match of source.matchAll(literals)){
  const text=match[2];if(!/[\u0621-\u064a\u066e-\u06d3]/.test(text))continue;
  const languages=['en','hi','ur','ml'].filter(language=>!hasTranslation(text,language));
  if(!languages.length)continue;
  const entry=missing.get(text)||{source:text,languages,files:[]};
  if(!entry.files.includes(file))entry.files.push(file);
  missing.set(text,entry);
 }
 // Include literals in arrays, helper calls, conditional branches and errors.
 // These are candidates, not certified interface strings: classify before
 // translating so stored record values and domain identifiers are not changed.
 for(const match of source.matchAll(/(['"])((?:\\.|(?!\1)[^\\\n])*[\u0621-\u064a\u066e-\u06d3](?:\\.|(?!\1)[^\\\n])*)\1/g)){
  const text=match[2],languages=['en','hi','ur','ml'].filter(language=>!hasTranslation(text,language));
  if(!languages.length)continue;
  const entry=unclassified.get(text)||{source:text,languages,files:[]};
  if(!entry.files.includes(file))entry.files.push(file);
  unclassified.set(text,entry);
 }
}
const summary={scanned_page_files:scanned,uncovered_literal_count:missing.size,additional_arabic_literal_candidates:unclassified.size,scope:'src/v267/pages only; candidates require classification; templates, legacy login, portals and runtime output still require review; not full-platform certification'};
console.log(JSON.stringify(process.argv.includes('--details')?{...summary,missing:[...missing.values()],unclassified:[...unclassified.values()]}:summary,null,2));
if(process.argv.includes('--check')&&(missing.size||unclassified.size))process.exitCode=1;
