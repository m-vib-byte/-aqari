# AQARI V198 — Release Freeze

## الحالة الفعلية التي تم التحقق منها
- Workspace باسم `عقاري`.
- slug: `aqari-main`.
- App State موجود revision = 1.
- payload الحالي JSON object فارغ (0 مفاتيح عليا).

## ما تضيفه V198
- قراءة آمنة لبيانات AQARI الموجودة في `localStorage`.
- رفع Snapshot إلى `aqari_app_state` يدويًا فقط.
- معاينة بيانات السحابة قبل أي Restore.
- Restore من السحابة إلى localStorage لا يكتب فوق البيانات الموجودة افتراضيًا.
- الكتابة تعتمد على Supabase Auth + RLS + الدور الحالي.

## الأوامر المتاحة في المتصفح
بعد تسجيل الدخول:
```js
await AQARI_CLOUD_SYNC.downloadCloudPreview()
AQARI_CLOUD_SYNC.collectLocalSnapshot()
await AQARI_CLOUD_SYNC.uploadLocal()
await AQARI_CLOUD_SYNC.restoreCloudToLocal({ overwrite: false })
```

## حماية البيانات
لا يوجد Auto-sync ولا Auto-overwrite في V198. الهدف هو أول ترحيل آمن واختبار الحفظ/الاسترجاع قبل تشغيل المزامنة التلقائية.
