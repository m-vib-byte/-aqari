-- Read-only comparison: original columns intentionally exclude additive metadata.
select jsonb_build_object('id',id,'title',title,'kind',kind,'status',status,'revision',revision,
 'original_row_md5',md5(jsonb_build_object('id',id,'workspace_id',workspace_id,'kind',kind,'kind_label',kind_label,
 'title',title,'fields',fields,'clauses',clauses,'revision',revision,'status',status,'request_id',request_id,
 'created_by',created_by,'updated_by',updated_by,'created_at',created_at,'updated_at',updated_at)::text),
 'content_md5',md5(fields::text||clauses::text),'clause_array_count',jsonb_array_length(clauses),
 'text_length',length(clauses->0->>'text'),
 'numbered_lines',(select count(*) from regexp_matches(clauses->0->>'text','(^|[\r\n])[[:space:]]*[0-9٠-٩]{1,2}[[:space:]]*[-–.ـ:)]','g')))
from private.aqari_rental_template_drafts_v2 order by id;
-- Baseline 2026-09-21: id e1037221-60ff-4f0f-86bf-41535f6d1f79, title محل,
-- rental_agreement/draft/revision4, original_row_md5 9489308239fa6c8b31d9575cd844148e,
-- content_md5 7a41bbc4c82b94e6409d456a10715977, array1/text15657/numbered_lines36.
