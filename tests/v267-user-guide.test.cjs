const test=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {resolve}=require('node:path');
const source=readFileSync(resolve(__dirname,'../src/v267/pages/user-guide.js'),'utf8');
test('embedded guide covers every current product audience',()=>{for(const role of ['general_manager','accountant','collector','maintenance','property_manager','tenant','partner'])assert.match(source,new RegExp(role+':'));});
test('guide explains sensitive operational safeguards',()=>{for(const phrase of ['التوثيق الثنائي','لا تسجل تحصيلاً دون عقد فعال','الرقم الموحد','المتوقع منفصل','براءة الذمة'])assert.ok(source.includes(phrase),phrase);});
test('guide contains no personal or synthetic business data',()=>{assert.doesNotMatch(source,/civil_id|TEST-|example\.com|برج شيخة|ضحاوي/);});
