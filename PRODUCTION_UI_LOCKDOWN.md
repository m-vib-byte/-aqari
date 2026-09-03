# AQARI V198 — Release Freeze

## الهدف
تنظيف تجربة المستخدم النهائية وعدم إظهار لوحات الفحص والهندسة في الاستخدام اليومي.

## السلوك
- في الوضع العادي يتم إخفاء لوحات:
  - Cleanup
  - Production Hardening
  - Production Readiness
  - First Run Migration
  - Safe Autosync
  - Production Status
  - Final Release diagnostics
- تبقى المزايا الأساسية والمنصة نفسها ظاهرة.
- وضع Debug يمكن تفعيله فقط عند الحاجة:
  - أضف `?debug=1` للرابط، أو
  - من Console: `AQARI_DEBUG.enable()`
- للإلغاء: `AQARI_DEBUG.disable()`

## لماذا هذا مهم؟
الإصدارات السابقة كانت تضيف لوحات مراقبة كثيرة فوق الواجهة. V198 يخلي النسخة النهائية أنظف للمستخدم بدون حذف أدوات الدعم الفني.
