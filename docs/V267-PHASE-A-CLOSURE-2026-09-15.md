# AQARI V267 — ملحق إغلاق المرحلة A — 15 سبتمبر 2026

هذا الملحق لا يستبدل قائمة البنود 1–155 ولا يخفف شروط B/C/D. وظيفته تحديث الأدلة بعد E54 على خط PR #192 نفسه. أي بند لم يثبت هنا أو في سجل الـ155 يبقى بحالته السابقة. **A = إغلاق وظيفي برمجي/خادمي قابل لإعادة التطبيق على Staging؛ أما الاستخدام بحسابات فعلية والمزودون والأجهزة والنسخ والاستعادة والاعتماد النهائي فهي أدلة لاحقة ولا يجوز تسميتها COMPLETE لمجرد وجود الكود.**

## الأدلة الجديدة

| الرمز | التنفيذ والدليل | أثره على بنود 155 |
|---|---|---|
| E55 | `notification-dispatch-completion-20260915.sql` + Dispatcher المحمي + Cron: يعيد فحص الشكر بعد السداد والتنبيهات التشغيلية، claim/result مع idempotency وإعادة المحاولة. Staging أبقى الرسائل `awaiting_configuration` عند غياب المزوّد بدل نجاح كاذب، واختبار rollback أثبت bridge→claim→result. | G08-06..10، G10-15، G10-19، G12-15: الجزء البرمجي للإرسال/التدقيق مغلق؛ التسليم الحقيقي يبقى مزودًا خارجيًا/B. |
| E56 | KNET intents + رابط الدفع الخادمي + `provider-webhook.py` + التسوية الذرية إلى `aqari_rent_payments`. Rollback مستضاف أثبت Intent→Webhook→وصل رسمي→رصيد صفر→إلغاء التذكير→حدث إرسال، وإعادة webhook بلا دفعة ثانية. | G12-03: إنشاء الرابط والربط الداخلي مغلق برمجيًا، Sandbox الحقيقي خارجي. G12-04: الترحيل الذري وإصدار الوصل وإيقاف التذكير مغلق برمجيًا. |
| E57 | `official-commercial-statement-20260915.sql`: كشف رسمي واحد يجمع الإيجار + CAM + نسبة المبيعات + التحصيل التجاري + عكوسه دون double count. Rollback مستضاف أعاد 130.000 رسوم، 215.000 دفعات، صافي -85.000 في fixture معزول ثم رجع كل الصفوف. | G07-06، G12-11، G11-05: إزالة الحظر العام على الكشف التجاري وربط CAM/المبيعات بالمخرج الرسمي. |
| E58 | نماذج رسمية إضافية داخل **نفس** official document engine: `exit_notice` مصدره `aqari_vacating_settlements.vacate_date`، و`discount_approval` مصدره الخصم المحفوظ للفترة/العقد مع رفض `DOCUMENT_NO_SAVED_DISCOUNT`. Overlay البناء يضيفهما للمركز دون مسار أرشيف ثانٍ. | G06-05: إشعار الإخلاء مولد ومؤرشف من مصدر محفوظ. G11-01: اعتماد الخصم أصبح نموذجًا رسميًا مرتبطًا بالمصدر. |
| E59 | سجل تسليم مباشر للمخرجات الرسمية: `aqari_official_document_handovers` + void ledger + RPC/UI. لا يقبل التسجيل إلا إذا كان PDF لنفس الإصدار موجودًا في `aqari_official_pdf_artifacts` وبصمته محفوظة؛ لا حاجة لإعادة رفع المستند الرسمي. | G11-04: فجوة إعادة رفع المخرجات الرسمية أغلقت برمجيًا؛ قبول record فعلي ينتظر أول PDF رسمي مؤرشف في B. |
| E60 | Webhook WhatsApp Canonical لرسائل الصيانة: توقيع HMAC + `maintenance.message` + رقم البلاغ المولد + sender/message refs. الخادم يطابق رقم المرسل مع مستأجر نفس البلاغ، يحفظ سجلًا immutable، يرفض mismatch ولا ينشئ/يغير طلبًا تلقائيًا. | G10-10، G10-13، G12-15: الربط الوارد بالرقم الموحد مغلق برمجيًا؛ Native WhatsApp adapter/live provider يبقى خارجيًا. |
| E61 | Build gates على نفس PR: `scripts/check.mjs` يرفض رجوع الحظر التجاري، غياب نماذج الإخلاء/الخصم، غياب handover/PDF binding، أو اختفاء inbound maintenance linking. `build-vercel.mjs` يشغل اختبارات provider webhook الموقعة مع اختبارات KNET/dispatch. | G01-02/G01-03/G11-07: يمنع اعتبار Overlay/زر دون عقد خادمي ودليل بناء. |

## تحديث الحالات التي تجاوزتها المصفوفة التاريخية

| البنود | حالة A المحدثة | ما يمنع COMPLETE النهائي |
|---|---|---|
| G06-05 | **منفذ برمجيًا** — إشعار إخلاء مصدره تاريخ الإخلاء المحفوظ، ثم نفس الترقيم/الإصدار/البصمة/الأرشيف الرسمي. | B: حساب فعلي + تنزيل/طباعة PDF من المستند المصدر. |
| G06-06 | **منفذ برمجيًا** — Unit handover bundle الحالي يجمع المصدر/الأدلة/PDF ويحمي البايتات. | B/C: حساب/Storage/جهاز فعلي. |
| G06-08 | **منفذ برمجيًا** — official PDF archive وreceipt/handover archives immutable/create-only. | B: إنتاج أول بايتات فعلية لكل نوع في نفس المرشح. |
| G07-01..03 | **منفذ برمجيًا في المسارات الحساسة الحالية** — server mutation audit + delete guard + cancellation reason audit. | B: مصفوفة كل الأدوار والواجهات؛ لا ادعاء شمول خارجي قبل الرحلة الفعلية. |
| G07-06/G07-07 | **منفذ برمجيًا** — due schedule + monthly collection + collection rate، والتجاري أصبح ضمن الكشف الرسمي. | B: مطابقة بيانات المشروع الفعلية. |
| G08-06..10 | **عامل الإرسال مغلق برمجيًا** — maintenance/SLA/lease/vendor/returned-cheque queues تصل للdispatcher وتبقى waiting عند غياب config. | مزود live/Sandbox حقيقي وتسليم فعلي. |
| G09-03/G12-09 | **فرض recent MFA موجود برمجيًا** للأدوار الحساسة والعمليات المحمية. | B: حسابات فعلية + تسجيل/استعادة عوامل + سياسة تشغيل. |
| G10-10 | **منفذ برمجيًا** — رسالة WhatsApp موثقة تربط طلبًا موجودًا فقط بعد مطابقة request_no + tenant phone. | Native WhatsApp provider adapter/live webhook. |
| G10-15/G10-19 | **منفذ برمجيًا** — suppression بعد السداد + thanks dispatch + audit/idempotency. | مزود فعلي وموافقة المستلم/التسليم. |
| G11-01 | **تقدم وظيفي جديد** — exit notice وdiscount approval أضيفا إلى المركز الحالي مع بقية الكتالوج؛ التسوية/الوحدة/الرواتب لها مسارات قائمة. | جرد نهائي للأسماء/الحقول والطباعة مع الحسابات والأجهزة في B. |
| G11-02/G11-03 | **حراس التسوية موجودون** — final settlement source يطلب utility/legal balances ويحسب rent+damage+deposit؛ لا يصدر براءة عند التزامات غير محسومة. | B: رحلة إخلاء كاملة من بيانات حقيقية + PDF. |
| G11-04 | **منفذ برمجيًا** — generated official handover ledger مرتبط بالنسخة/PDF hash مباشرة. | B: لا توجد حاليًا official PDF artifacts في Staging لتسجيل handover حقيقي دون fixture. |
| G12-03 | **منفذ برمجيًا حتى حدود المزوّد** — Intent/property scope/balance/expiry/idempotency + server link dispatcher. | مواصفات/credentials/Sandbox KNET الحقيقي. |
| G12-04 | **منفذ برمجيًا ومستضاف rollback** — verified webhook → atomic payment+official receipt+reminder stop+delivery event، replay-safe. | مزود KNET الحقيقي فقط. |
| G12-11 | **منفذ برمجيًا** — official statement يضم CAM/sales/commercial collections/reversals. | B: بيانات تجارية فعلية وحساب/طباعة. |
| G12-15 | **إطار القنوات والعامل البرمجي منفذ** مع سجلات status/retry/idempotency. | WhatsApp/Email/SMS/Push provider credentials + delivery/read semantics. |
| G12-19 | **خرائط QuickBooks/Zoho/Xero موجودة ومختبرة** لقيود مزدوجة متوازنة وKWD، والأسرار لا تدخل payload. | OAuth/Sandbox/tenant IDs/actual API delivery لكل مزود خارجي. |

## ما يزال يمنع إعلان A مغلقة بالكامل

1. **ناتج Preview على آخر SHA:** يجب أن يصبح Build الأخير أخضر بعد اختبارات Webhook/النماذج الجديدة؛ نتيجة READY قديمة لا تكفي.
2. **Same-SHA GitHub Actions:** عطل التخصيص التاريخي ما زال يظهر كـ`steps=[]` و`runner_id=0` في بعض Runs؛ لا يُعاد توصيفه كنجاح.
3. **المزودون الخارجيون:** لا توجد في Staging حاليًا إعدادات live/Sandbox لـKNET/WhatsApp/Email/SMS/Push أو OAuth للدفاتر. الكود fail-closed ولا يصطنع إرسالًا.
4. **بنود تحقق خارجي بطبيعتها:** فشل تسجيل الدخول في Auth logs، تشفير المزود/إدارة المفاتيح، مراجعة قانونية/محاسبية، نسخ جغرافية 24 ساعة، SLA شبكة هاتف، أجهزة فعلية، كلها لا يمكن تحويلها إلى دليل A برمجي فقط.
5. **دليل الفيديو عند التسليم G12-26:** الدليل النصي موجود؛ تسجيل الفيديو النهائي يجب أن يتم على الشاشات المستقرة بعد B حتى لا يوثق UI مرشحًا متغيرًا.
6. **Generated handover runtime:** الكود والواجهة موجودان لكن Staging يحتوي صفر official PDF artifacts حاليًا، لذلك الاختبار الحقيقي ينتقل إلى B فور إصدار أول PDF فعلي.

## قاعدة الانتقال إلى B

لا نعلن A مغلقة إلا بعد: (أ) Build أخضر على SHA واحد يحمل هذه الأدلة؛ (ب) جرد أخير يثبت عدم بقاء فجوة كود داخل 155؛ (ج) كل بند غير قابل للإغلاق برمجيًا مصنف صراحة كمزود/اعتماد خارجي أو B/C، وليس كـ«مكتمل». بعد ذلك يبدأ B على نفس SHA دون تغيير المرشح.
