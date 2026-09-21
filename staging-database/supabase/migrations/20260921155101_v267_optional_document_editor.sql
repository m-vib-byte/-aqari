-- Optional data-only editor metadata. No existing template, legal clause,
-- archive, version or draft is rewritten by this migration.
begin;

create or replace function private.aqari_editor_keys(v jsonb,allowed text[],required text[] default '{}')
returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
 if jsonb_typeof(v) is distinct from 'object' then return false;end if;
 return v ?& required and not exists(select 1 from jsonb_object_keys(v)k where not(k=any(allowed)));
end $$;
create or replace function private.aqari_editor_number(v jsonb,lo numeric,hi numeric,whole boolean default false)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare n numeric;begin
 if jsonb_typeof(v) is distinct from 'number' then return false;end if;
 n:=v::numeric;return n between lo and hi and (not whole or n=trunc(n));
end $$;
create or replace function private.aqari_editor_utf16_length(s text)
returns integer language sql immutable strict security invoker set search_path='' as $$
 select 2*length(s)-length(regexp_replace(s,U&'[\+010000-\+10FFFF]','','g'))
$$;
create or replace function private.aqari_editor_source_boundary(s text,off integer)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare lo integer:=0;hi integer;mid integer;n integer;matched text[];token text;cursor_at integer:=1;at_char integer;start16 integer;end16 integer;
begin
 if s is null or off is null or off<0 or off>private.aqari_editor_utf16_length(s) then return false;end if;
 -- Binary search raw source codepoints for the exact UTF-16 boundary. A
 -- position between the two UTF-16 units of an astral character never matches.
 hi:=length(s);
 while lo<=hi loop
  mid:=(lo+hi)/2;n:=private.aqari_editor_utf16_length(left(s,mid));
  if n=off then exit;elsif n<off then lo:=mid+1;else hi:=mid-1;end if;
 end loop;
 if lo>hi then return false;end if;
 -- Same complete and malformed placeholder forms as the browser tokenizer.
 for matched in select regexp_matches(s,'(\{\{[^{}\r\n]*\}\}|\{\([^{}\r\n]*\}\}|\{\{[a-zA-Z0-9_ \t-]*(?:\}|(?=[^a-zA-Z0-9_ \t-]|$))|\{[a-zA-Z0-9_]+\}\})','g') loop
  token:=matched[1];at_char:=strpos(substr(s,cursor_at),token)+cursor_at-1;
  start16:=private.aqari_editor_utf16_length(left(s,at_char-1));end16:=start16+private.aqari_editor_utf16_length(token);
  if off>start16 and off<end16 then return false;end if;
  cursor_at:=at_char+length(token);
 end loop;
 return true;
end $$;
create or replace function private.aqari_editor_style_valid(v jsonb,in_range boolean default false)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare k text;allowed text[];begin
 allowed:=case when in_range then array['font_family','font_pt','bold','underline'] else array['font_family','bold','underline','direction','paragraph_gap_mm','clause_before_mm','clause_after_mm','numbering'] end;
 if not private.aqari_editor_keys(v,allowed) or (in_range and v='{}'::jsonb) then return false;end if;
 for k in select jsonb_object_keys(v) loop
  if k='font_family' then if coalesce(v->>k,'') not in('sans','mono') then return false;end if;
  elsif k='font_pt' then if not private.aqari_editor_number(v->k,8,36) then return false;end if;
  elsif k in('bold','underline') then if jsonb_typeof(v->k) is distinct from 'boolean' then return false;end if;
  elsif k='direction' then if coalesce(v->>k,'') not in('auto','rtl','ltr') then return false;end if;
  elsif k='numbering' then if coalesce(v->>k,'') not in('none','decimal') then return false;end if;
  elsif not private.aqari_editor_number(v->k,0,case when k='paragraph_gap_mm' then 12 else 20 end) then return false;
  end if;
 end loop;return true;
end $$;
create or replace function private.aqari_template_editor_valid(e jsonb,clauses jsonb default null)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare v jsonb;s jsonb;k text;prev jsonb:=null;ranges jsonb;role_name text;txt text;
begin
 if not private.aqari_editor_keys(e,array['version','style','ranges','page_breaks','trailing_blank_pages','logo','signers'],array['version']) or e->'version' is distinct from '1'::jsonb then return false;end if;
 if e ? 'style' and not private.aqari_editor_style_valid(e->'style') then return false;end if;
 if e ? 'ranges' then
  ranges:=e->'ranges';if jsonb_typeof(ranges) is distinct from 'array' then return false;end if;
  if jsonb_array_length(ranges)>300 then return false;end if;
  for v in select value from jsonb_array_elements(ranges) loop
   if not private.aqari_editor_keys(v,array['clause','part','start','end','style'],array['clause','part','start','end','style']) then return false;end if;
   if not private.aqari_editor_number(v->'clause',0,49,true) or coalesce(v->>'part','') not in('title','text')
    or not private.aqari_editor_number(v->'start',0,60000,true) or not private.aqari_editor_number(v->'end',1,60000,true)
    or not private.aqari_editor_style_valid(v->'style',true) then return false;end if;
   if (v->>'start')::numeric>=(v->>'end')::numeric then return false;end if;
   if clauses is not null then
    if jsonb_typeof(clauses) is distinct from 'array' then return false;end if;
    s:=clauses->(v->>'clause')::int;if jsonb_typeof(s->(v->>'part')) is distinct from 'string' then return false;end if;
    txt:=s->>(v->>'part');
    if not private.aqari_editor_source_boundary(txt,(v->>'start')::int) or not private.aqari_editor_source_boundary(txt,(v->>'end')::int) then return false;end if;
   end if;
  end loop;
  -- Preserve input range order, but reject overlap within any clause/part.
  for v in select value from jsonb_array_elements(ranges) order by (value->>'clause')::int,value->>'part',(value->>'start')::int loop
   if prev is not null and prev->'clause'=v->'clause' and prev->>'part'=v->>'part' and (prev->>'end')::int>(v->>'start')::int then return false;end if;prev:=v;
  end loop;
 end if;
 if e ? 'page_breaks' then
  s:=e->'page_breaks';if jsonb_typeof(s) is distinct from 'array' then return false;end if;
  if jsonb_array_length(s)>50 then return false;end if;prev:=null;
  for v in select value from jsonb_array_elements(s) loop
   if not private.aqari_editor_keys(v,array['clause','offset'],array['clause','offset']) or not private.aqari_editor_number(v->'clause',0,49,true) or not private.aqari_editor_number(v->'offset',0,60000,true) then return false;end if;
   if prev is not null and ((v->>'clause')::int<(prev->>'clause')::int or (v->>'clause')::int=(prev->>'clause')::int and (v->>'offset')::int<=(prev->>'offset')::int) then return false;end if;
   if clauses is not null then
    if jsonb_typeof(clauses) is distinct from 'array' or jsonb_typeof(clauses#>array[v->>'clause','text']) is distinct from 'string' then return false;end if;
    if not private.aqari_editor_source_boundary(clauses#>>array[v->>'clause','text'],(v->>'offset')::int) then return false;end if;
   end if;prev:=v;
  end loop;
 end if;
 if e ? 'trailing_blank_pages' and not private.aqari_editor_number(e->'trailing_blank_pages',0,10,true) then return false;end if;
 if e ? 'logo' then
  v:=e->'logo';if not private.aqari_editor_keys(v,array['x_mm','y_mm','width_mm','height_mm','repeat'],array['x_mm','y_mm','width_mm','height_mm','repeat']) then return false;end if;
  if not private.aqari_editor_number(v->'x_mm',8,190) or not private.aqari_editor_number(v->'y_mm',8,281) or not private.aqari_editor_number(v->'width_mm',12,100) or not private.aqari_editor_number(v->'height_mm',8,60) or coalesce(v->>'repeat','') not in('first','all') then return false;end if;
  if (v->>'x_mm')::numeric+(v->>'width_mm')::numeric>202.00000001 or (v->>'y_mm')::numeric+(v->>'height_mm')::numeric>289.00000001 then return false;end if;
 end if;
 if e ? 'signers' then
  v:=e->'signers';if not private.aqari_editor_keys(v,array['order','details'],array['order','details']) then return false;end if;
  if jsonb_typeof(v->'order') is distinct from 'array' or not private.aqari_editor_keys(v->'details',array['owner','tenant','receiver','accountant']) then return false;end if;
  if jsonb_array_length(v->'order')>4 or exists(select 1 from jsonb_array_elements(v->'order')x where x not in('"owner"','"tenant"','"receiver"','"accountant"')) or (select count(distinct x) from jsonb_array_elements(v->'order')x)<>jsonb_array_length(v->'order') then return false;end if;
  for role_name,s in select key,value from jsonb_each(v->'details') loop
   if not private.aqari_editor_keys(s,array['civil_id','nationality'],array['civil_id','nationality']) or jsonb_typeof(s->'civil_id') is distinct from 'boolean' or jsonb_typeof(s->'nationality') is distinct from 'boolean' then return false;end if;
  end loop;
 end if;
 return true;
end $$;

do $$begin
 if to_regprocedure('private.aqari_template_presentation_valid_before_editor(jsonb,jsonb)') is null then
  alter function private.aqari_template_presentation_valid(jsonb,jsonb) rename to aqari_template_presentation_valid_before_editor;
 end if;
 if to_regprocedure('private.aqari_rental_templates_before_editor(uuid,text,jsonb)') is null then
  alter function private.aqari_rental_templates(uuid,text,jsonb) rename to aqari_rental_templates_before_editor;
 end if;
end $$;
create or replace function private.aqari_template_presentation_valid(p jsonb,f jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare extra_fields jsonb:=coalesce(f,'[]'::jsonb);role_name text;k text;
begin
 if p is null or p='null'::jsonb or not(p ? 'editor') then return private.aqari_template_presentation_valid_before_editor(p,f);end if;
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>65536 or not private.aqari_template_editor_valid(p->'editor') then return false;end if;
 foreach role_name in array array['owner','tenant','receiver','accountant'] loop
  foreach k in array array['civil_id','nationality'] loop
   if p#>array['editor','signers','details',role_name,k]='true'::jsonb then extra_fields:=extra_fields||jsonb_build_array(jsonb_build_object('key',role_name||'_'||k));end if;
  end loop;
 end loop;
 -- Synthetic declarations are used only by validation; they are never stored.
 return private.aqari_template_presentation_valid_before_editor(p-'editor',extra_fields);
end $$;
create or replace function private.aqari_rental_templates(w uuid,act text,d jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;record jsonb;
begin
 -- The existing implementation remains the sole authority for permissions,
 -- approval, idempotency and revisions. A validation exception below rolls
 -- back the entire delegated call, including its history/version writes.
 result:=private.aqari_rental_templates_before_editor(w,act,d);
 if act in('save_draft','publish','copy_draft','revise') then
  record:=result->'record';
  if record#>'{presentation,editor}' is not null and not private.aqari_template_editor_valid(record#>'{presentation,editor}',record->'clauses') then
   raise invalid_parameter_value using message='INVALID_TEMPLATE_PRESENTATION';
  end if;
 end if;
 return result;
end $$;
revoke all on function private.aqari_editor_keys(jsonb,text[],text[]),private.aqari_editor_number(jsonb,numeric,numeric,boolean),private.aqari_editor_utf16_length(text),private.aqari_editor_source_boundary(text,integer),private.aqari_editor_style_valid(jsonb,boolean),private.aqari_template_editor_valid(jsonb,jsonb),private.aqari_template_presentation_valid_before_editor(jsonb,jsonb),private.aqari_template_presentation_valid(jsonb,jsonb),private.aqari_rental_templates_before_editor(uuid,text,jsonb),private.aqari_rental_templates(uuid,text,jsonb) from public,anon,authenticated,service_role;
-- Preserve only the original authenticated private entry used by the public
-- SECURITY INVOKER wrapper; the renamed implementation is not directly callable.
grant execute on function private.aqari_rental_templates(uuid,text,jsonb) to authenticated;
commit;
