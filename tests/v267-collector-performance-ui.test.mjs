import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/v267/pages/property-statements.js',import.meta.url),'utf8');
const has=(pattern,message)=>assert.match(source,pattern,message);

test('property statements expose collector performance for the selected property and month',()=>{
  has(/تقرير أداء موظفي التحصيل/);
  has(/aqari_collector_performance_report/);
  has(/p_workspace_id:d\.session\.bound\.workspace/);
  has(/p_property_id:select\.value/);
  has(/p_from:range\.from/);
  has(/p_to:range\.to/);
});

test('collector cards show operation count amount regular collections and settlements',()=>{
  has(/العمليات: \{count\} • المبلغ: \{amount\} د\.ك • العقود: \{contracts\}/);
  has(/تحصيل عادي: \{regularCount\} \/ \{regularAmount\} د\.ك • تسويات: \{settlementCount\} \/ \{settlementAmount\} د\.ك/);
  has(/x\.is_settlement\?t\('تسوية'\):t\('تحصيل عادي'\)/);
});

test('legacy names are visibly unmatched and can be mapped only through the protected RPC',()=>{
  has(/legacy_unmatched/);
  has(/لن تنسب المنصة هذه العمليات لموظف تلقائياً/);
  has(/aqari_collector_alias_candidates/);
  has(/aqari_set_collector_alias/);
  has(/تتطلب تحقق MFA حديثاً/);
});

test('report UI says cancelled receipts are excluded and settlement needs saved classification',()=>{
  has(/يستبعد الوصولات الملغاة/);
  has(/التسويات لا تُحسب إلا عند وجود تصنيف صريح محفوظ/);
});

test('property selector includes authorized properties even without imported statement rows',()=>{
  has(/from\('aqari_properties'\)/);
  has(/const \[rows,properties\]=await Promise\.all/);
  has(/لا يوجد كشف مصدر محفوظ لهذا الشهر\. يمكنك عرض كشف التحصيل الفعلي أو تقرير موظفي التحصيل/);
});
