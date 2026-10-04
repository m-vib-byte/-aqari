-- Existing PDF editor uploads use property_other + property_document.
-- Keep every existing category/entity rule and all reserve/finalize guards.
-- Older production schemas without this validator need no compatibility patch.
do $patch$
declare
 signature regprocedure:=to_regprocedure('private.aqari_document_category_valid(text,text,text)');
 source text;
 anchor text:='and kind=case category when ''signed_lease'' then ''signed_contract'' else ''supporting_document'' end';
 replacement text:='and (kind=case category when ''signed_lease'' then ''signed_contract'' else ''supporting_document'' end or (category=''property_other'' and entity=''property'' and kind=''property_document''))';
begin
 if signature is null then return;end if;
 source:=pg_get_functiondef(signature);
 if strpos(source,replacement)>0 then return;end if;
 if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 then
  raise exception 'DOCUMENT_CATEGORY_COMPAT_ANCHOR_CHANGED';
 end if;
 execute replace(source,anchor,replacement);
end $patch$;
