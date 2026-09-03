# AQARI V198 — Release Freeze

لا يتم دمج `main` أو اعتبار النشر ناجحًا إلا بعد تحقق الشروط التالية:

- `npm run check` = PASS
- JavaScript syntax = PASS
- Preview deployment يعمل
- الصفحة الرئيسية تحتوي `V198`
- `/api/health` يرجع `ok: true`
- `/api/release` يرجع `V198`
- `/api/config-status` يعمل بدون كشف أي أسرار
- Smoke/Deployment verification = PASS
- لا توجد أخطاء Build
- لا توجد Runtime errors حرجة
- بعد ذلك فقط يتم الدمج إلى `main`

هذه الحزمة لا تدعي أن قاعدة البيانات أو الدفع أو واتساب أو البريد أصبحت متصلة؛ ذلك يحتاج إعداد أسرار الإنتاج واختبارات حية.
