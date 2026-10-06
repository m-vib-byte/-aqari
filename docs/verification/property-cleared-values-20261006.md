# حفظ مسح نوع العقار والدخل المعلن

## الخلل والدليل

دالة private.aqari_property_master_snapshot كانت ترجع إلى metadata القديم عندما يصبح النوع فارغًا أو الدخل null، حتى مع وجود سجل رئيسي محفوظ. أعيد إنتاج الخلل باستخدام دالة SQL الأصلية من property-master-file.sql ومن property-batch-a2-core.sql داخل PostgreSQL معزول في الذاكرة.

## الإصلاح المرشح

ملف staging-database/sql/property-master-cleared-values-fix.sql يغيّر التعبيرين فقط في تعريف الدالة الموجود. إذا كان السجل الرئيسي موجودًا، فهو المرجع حتى عند المسح. إذا لم يوجد، تبقى قراءة metadata القديمة. لا UPDATE أو DELETE لبيانات أعمال ولا تغيير للواجهات العامة أو الصلاحيات. يحافظ pg_get_functiondef على الحقول الإضافية الحالية؛ يتوقف إذا اختلفت العبارات المعروفة، ويقبل تكرار التطبيق.

## الاختبار

27 تحققًا ناجحًا: إعادة إنتاج الخلل في النسختين، المسح، الصفر، دقة الفلس، قراءة السجلات القديمة، تكرار التطبيق، استبعاد مساحة أخرى وعقار غير موجود، صلاحيات anon/authenticated/service_role، الحقول الممتدة، عدم تغيير metadata، عدم تأثر السجل الرئيسي بقيمة legacy غير صالحة، ورفض تعريف غير معروف دون استبداله.

```sh
AQARI_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node staging-database/local-test/run-property-master-cleared-values.mjs
```

المحرك مثبت في staging-database/local-test/package-lock.json؛ يمكن حذف المتغير عند تثبيت اعتماداته محليًا.

## حدود التسليم

SQL مرشح للمراجعة، لم يطبّق في Preview أو Production. لم تُنشأ migration آلية لأن Supabase CLI غير متاح في هذه الجلسة. يلزم فحص التعريف الفعلي في البيئة المعزولة وتطبيق المرشح عبر مسار الهجرات المعتمد ثم قبول الحفظ وإعادة الفتح بحساب مصادق قبل اعتباره مكتملًا. فحوص الرأس f16ab6e لواجهة #434 نجحت (4 نجاح وSupabase Preview متجاوز).

مرجع سلوك CASE: https://www.postgresql.org/docs/current/functions-conditional.html
