import {readdirSync,statSync,lstatSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const output=join(root,'public-build');
// Generated public assets only. Server code and build inputs stay at the root.
const pages=new Set(['index.html','login.html','partner.html','tenant.html','recovery.html','reset-password.html','v267-requirements.html']);
const rootAssets=new Set(['.js','.css','.svg','.webmanifest']);
const browserAssets=new Set(['.js','.mjs','.css','.svg','.png']);
const files=[];
function add(path){if(lstatSync(join(root,path)).isSymbolicLink())throw Error('PUBLIC_SYMLINK_FORBIDDEN: '+path);files.push(path);}
for(const name of readdirSync(root))if(statSync(join(root,name)).isFile()&&(pages.has(name)||(rootAssets.has(extname(name))&&name!=='middleware.js')))add(name);
function walk(dir,extensions){for(const name of readdirSync(join(root,dir))){const path=join(dir,name),s=lstatSync(join(root,path));if(s.isSymbolicLink())throw Error('PUBLIC_SYMLINK_FORBIDDEN: '+path);if(s.isDirectory())walk(path,extensions);else if(extensions.has(extname(name)))add(path);}}
walk('src',browserAssets);
walk('lib/pdf_fonts',new Set(['.ttf']));
// Existing requirements-page link; no other internal documentation is public.
add('docs/V267-REQUIREMENTS-155.md');
add('lib/pdf_fonts/LICENSE.txt');
rmSync(output,{recursive:true,force:true});
for(const path of files){const dest=join(output,path);mkdirSync(resolve(dest,'..'),{recursive:true});copyFileSync(join(root,path),dest);}
console.log('Prepared '+files.length+' explicit browser assets in public-build.');
