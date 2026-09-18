const fs = require('node:fs');
const path = require('node:path');

// Keep each VM's language state isolated while loading the real catalog graph.
// This helper supports the named imports/exports used by the locale modules.
module.exports = function localeVmSource() {
 const modules = new Map(), definitions = [];
 function load(filename) {
  filename = path.resolve(filename);
  if (modules.has(filename)) return modules.get(filename);
  const id = '__localeModule' + modules.size;
  modules.set(filename, id);
  const source = fs.readFileSync(filename, 'utf8');
  const exported = [...source.matchAll(/export\s+(?:const|let|function)\s+(\w+)/g)].map(match => match[1]);
  const body = source.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?$/gm, (_match, names, relative) => {
   const dependency = load(path.resolve(path.dirname(filename), relative));
   return 'const {' + names.replace(/\s+as\s+/g, ':') + '} = ' + dependency + ';';
  }).replace(/\bexport\s+/g, '');
  definitions.push('const ' + id + '=(()=>{\n' + body + '\nreturn {' + exported.join(',') + '};})();');
  return id;
 }
 const locale = load(path.resolve(__dirname, '../../src/v267/components/locale.js'));
 const portal = load(path.resolve(__dirname, '../../src/v267/components/portal-locale.js'));
 return '(()=>{\n' + definitions.join('\n') + '\nreturn {...' + locale + ',...' + portal + '};})()';
};
