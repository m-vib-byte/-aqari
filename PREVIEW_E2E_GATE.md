# AQARI V198 — Release Freeze

## الهدف
عدم دمج أي نسخة إلى `main` قبل اختبار Preview على متصفح حقيقي آليًا.

## فحوصات V198
- الصفحة الرئيسية تفتح وتحتوي علامة `V198`.
- لا توجد أخطاء JavaScript واضحة عند التحميل.
- Supabase bridge موجود.
- Cloud Sync موجود.
- Safe Autosync موجود.
- `/api/health` يعمل.
- `/api/supabase-status` يعمل.
- `/api/migration-status` يعمل.
- `/api/autosync-status` يعمل.
- `/api/production-readiness` يحافظ على عقد استجابة متسق في Preview، ويعرض عدد إعدادات Production المتاحة كمعلومة دون اشتراط حقنها في Preview.

## ما لم يتم إثباته بعد
- تسجيل دخول فعلي على Preview بحساب المستخدم.
- أول Migration من localStorage الخاص بالآيفون.
- نجاح Autosync بعد أول Migration.
- اكتمال أسرار Production ضمن نطاق Production؛ لا يمكن استنتاج ذلك من نطاق Preview.
- Production deployment.

هذه الخطوات تحتاج رابط Preview حي، لذلك هذا الإصدار يجهز الاختبار الآلي ولا يدعي أنه تم تشغيله على Vercel بعد.
