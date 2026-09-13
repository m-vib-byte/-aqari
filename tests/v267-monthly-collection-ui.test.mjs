import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/v267/pages/property-statements.js',import.meta.url),'utf8');
const has=(pattern,message)=>assert.match(source,pattern,message);

test('property statements expose a separate authoritative collection report action',()=>{
  has(/node\('button',t\('كشف التحصيل الفعلي'\)\)/);
  has(/aqari_monthly_collection_report/);
  has(/p_workspace_id:d\.session\.bound\.workspace/);
  has(/p_period:month\.value\+'-01'/);
  has(/p_property_id:select\.value/);
});

test('collection UI separates source statement from operational collection totals',()=>{
  has(/collectionResult=node\('div'\)/);
  has(/showCollection\(report\)/);
  has(/إيجار العقد: \{gross\} د\.ك • الخصومات: \{discount\} د\.ك • المطلوب: \{due\} د\.ك/);
  has(/المدفوع: \{paid\} د\.ك • المحتسب في النسبة: \{allocated\} د\.ك • المتبقي: \{remaining\} د\.ك/);
});

test('rate display shows denominator and overpayment instead of inflating percentage',()=>{
  has(/نسبة التحصيل: \{rate\} • مقام النسبة: \{denominator\} د\.ك • زيادة غير محتسبة في النسبة: \{over\} د\.ك/);
  has(/الوصولات الملغاة مستبعدة/);
  has(/الدفعات الزائدة تظهر منفصلة ولا ترفع النسبة/);
});

test('lease-level rows show due paid remaining discount and overpayment',()=>{
  has(/المطلوب: \{due\} د\.ك • المدفوع: \{paid\} د\.ك • المتبقي: \{remaining\} د\.ك/);
  has(/الخصم: \{discount\} د\.ك • الزيادة: \{over\} د\.ك/);
  has(/row\.status/);
});

test('operational reports remain available even when legacy source statement is absent',()=>{
  has(/لا يوجد كشف مصدر محفوظ لهذا الشهر\./);
  has(/يمكنك عرض كشف التحصيل الفعلي أو تقرير موظفي التحصيل/);
  has(/collection\.disabled=invalid/);
  has(/collector\.disabled=invalid/);
  has(/from\('aqari_properties'\)/);
});
