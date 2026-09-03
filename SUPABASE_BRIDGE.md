# AQARI V198 — Release Freeze

تم ربط حزمة عقاري ببيئة Supabase الموجودة فعليًا للمشروع.

## ما تم التحقق منه
- مشروع Supabase نشط.
- يوجد مستخدم Auth واحد.
- يوجد Workspace واحد.
- توجد Membership واحدة.
- يوجد App State واحد.
- جداول `aqari_workspaces`, `aqari_memberships`, `aqari_profiles`, `aqari_app_state` موجودة.
- سياسات RLS موجودة وتقيّد القراءة والكتابة حسب العضوية والدور.

## ملفات الربط
- `public-config.js` يحتوي URL المشروع والمفتاح Publishable فقط.
- `supabase-adapter.js` يوفر:
  - `signIn(email, password)`
  - `signOut()`
  - `refreshContext()`
  - `loadAppState()`
  - `saveAppState(payload, expectedRevision)`
- لا توجد كتابة تلقائية عند فتح الصفحة.
- الكتابة تتطلب مستخدمًا مصادقًا وعضوية نشطة ودورًا مسموحًا.

## ملاحظة أمنية
المفتاح Publishable مخصص للواجهة الأمامية ويمكن كشفه. الحماية الفعلية تعتمد على Supabase Auth + RLS.
لا يتم تضمين أي service-role key داخل الواجهة.

## التحذير الحالي
Supabase Security Advisor أفاد أن Leaked Password Protection غير مفعلة. يفضل تفعيلها قبل الإطلاق النهائي.
