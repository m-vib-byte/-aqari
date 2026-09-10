const test=require('node:test');
const fs=require('node:fs');
const crypto=require('node:crypto');
const paths=[
 'src/v267/pages/vacating-settlement.js',
 'staging-database/local-test/package.json',
 'tests/v267-vacating-settlement.test.mjs',
 'staging-database/sql/vacating-release.sql',
 'staging-database/tests/vacating_release.sql'
];
test('print exact inventory digests for current V267 candidate',()=>{
 for(const path of paths){const bytes=fs.readFileSync(path);console.log('V267_INVENTORY_DIGEST|'+path+'|'+bytes.length+'|'+crypto.createHash('sha256').update(bytes).digest('hex'));}
});
