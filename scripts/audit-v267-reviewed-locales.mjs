import fs from 'node:fs';
import {hasTranslation} from '../src/v267/components/locale.js';
import {SALARY_MESSAGES} from '../src/v267/domain/salary-labels.js';

// Fixed, manually classified scope. The broad page scanner remains diagnostic;
// technical identifiers and stored record values are not translation requirements.
const files = [
 'docs/v267-visible-locales-a.json',
 'docs/v267-visible-classification-a2.json',
 'docs/v267-visible-classification-b.json',
 'docs/visible-locale-classification-b2.json',
 'docs/V267-visible-classification-guide.json',
 'docs/V267-visible-classification-shell.json',
 'docs/verification/pr200-portal-visible-inventory.json',
];
const rows = files.flatMap(file => {
 const data = JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 return [...(data.records||data.entries||data.items||data.visible),
 ...(data.appCloudGate?.visibleSources||[]).map(source=>({source,category:'visible_ui'}))];
});
const visible = rows.filter(row=>/^(visible|ui-|already_localized)/.test(row.category||row.classification));
const sources = [...new Set([...visible.map(row=>row.source),...Object.keys(SALARY_MESSAGES)])].sort();
const missing = sources.filter(source=>['en','hi','ur','ml'].some((language,index)=>
 !(SALARY_MESSAGES[source]?.[index]||hasTranslation(source,language))));
const result = {
 scope:'Reviewed operational pages, shell, login/portals and generated salary documents; source coverage, not live device certification',
 classifiedOccurrences:rows.length,
 visibleOccurrences:visible.length,
 excludedOccurrences:rows.length-visible.length,
 salaryDocumentSources:Object.keys(SALARY_MESSAGES).length,
 requiredUniqueVisibleSources:sources.length,
 untranslated:missing.length,
 missing,
};
console.log(JSON.stringify(result,null,2));
if(missing.length) process.exitCode=1;
