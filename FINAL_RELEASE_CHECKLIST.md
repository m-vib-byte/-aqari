# AQARI V198 — Final Release Checklist

## الحزمة جاهزة من ناحية الكود المحلي
- JavaScript syntax checks
- Package self-tests
- Cloud Sync self-test
- Migration self-test
- Autosync self-test
- Preview E2E package self-test
- Route contract self-test
- Final release self-test

## قبل أول Migration
1. افتح Preview.
2. سجّل الدخول.
3. اضغط **تنزيل نسخة احتياطية**.
4. تأكد أن Cloud payload لا يزال فارغًا/مهيأً للنقل.
5. نفّذ **نقل بيانات هذا الجهاز**.
6. افتح Preview من جديد وتأكد أن البيانات موجودة.
7. شغّل E2E.
8. فعّل Autosync فقط بعد نجاح الخطوات السابقة.

## قبل Production
- جميع Environment Variables المطلوبة موجودة على Vercel.
- Build ناجح.
- Runtime errors الحرجة = 0.
- `/api/health` = PASS.
- `/api/release` = V198.
- `/api/final-release-status` = PASS.
- Preview E2E = PASS.
- أول Migration = PASS.
- بعد ذلك فقط يتم دمج `main` ونشر Production.

## Rollback
إذا فشل أي اختبار:
- لا تفعّل Autosync.
- لا تدمج `main`.
- استخدم ملف النسخة الاحتياطية المحلية الذي تم تنزيله قبل Migration.
