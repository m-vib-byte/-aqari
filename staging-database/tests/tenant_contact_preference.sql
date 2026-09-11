-- Isolated test database only. Verifies that tenant contact preference is fail-closed and reaches the reviewed delivery paths.
begin;
do $$
begin
 if not private.aqari_contact_channel_allowed('{"preferredContact":"both"}'::jsonb,'email') then raise exception 'BOTH_EMAIL_REJECTED';end if;
 if not private.aqari_contact_channel_allowed('{"preferredContact":"both"}'::jsonb,'whatsapp') then raise exception 'BOTH_WHATSAPP_REJECTED';end if;
 if not private.aqari_contact_channel_allowed('{"preferredContact":"email"}'::jsonb,'email') then raise exception 'EMAIL_REJECTED';end if;
 if private.aqari_contact_channel_allowed('{"preferredContact":"email"}'::jsonb,'whatsapp') then raise exception 'EMAIL_LEAKED_TO_WHATSAPP';end if;
 if not private.aqari_contact_channel_allowed('{"preferredContact":"whatsapp"}'::jsonb,'whatsapp') then raise exception 'WHATSAPP_REJECTED';end if;
 if private.aqari_contact_channel_allowed('{"preferredContact":"phone"}'::jsonb,'email') or private.aqari_contact_channel_allowed('{"preferredContact":"phone"}'::jsonb,'whatsapp') then raise exception 'PHONE_AUTOMATION_ALLOWED';end if;
 if private.aqari_contact_channel_allowed('{"preferredContact":"none"}'::jsonb,'email') or private.aqari_contact_channel_allowed('{"preferredContact":"none"}'::jsonb,'whatsapp') then raise exception 'NONE_AUTOMATION_ALLOWED';end if;
 if private.aqari_contact_channel_allowed('{"preferredContact":"invalid"}'::jsonb,'email') then raise exception 'INVALID_CONTACT_ALLOWED';end if;
 if private.aqari_preferred_delivery_channel('{"preferredContact":"email"}'::jsonb,'tenant@example.invalid','96550000000') is distinct from 'email' then raise exception 'EMAIL_DELIVERY_WRONG';end if;
 if private.aqari_preferred_delivery_channel('{"preferredContact":"whatsapp"}'::jsonb,'tenant@example.invalid','96550000000') is distinct from 'whatsapp' then raise exception 'WHATSAPP_DELIVERY_WRONG';end if;
 if private.aqari_preferred_delivery_channel('{"preferredContact":"both"}'::jsonb,'','96550000000') is distinct from 'whatsapp' then raise exception 'BOTH_FALLBACK_WRONG';end if;
 if private.aqari_preferred_delivery_channel('{"preferredContact":"email"}'::jsonb,'','96550000000') is not null then raise exception 'MISSING_EMAIL_FELL_BACK';end if;
 if private.aqari_preferred_delivery_channel('{"preferredContact":"none"}'::jsonb,'tenant@example.invalid','96550000000') is not null then raise exception 'NONE_DELIVERY_CREATED';end if;
 if position('preferredContact' in pg_get_functiondef('private.aqari_imported_tenant_save(uuid,text,jsonb,bigint,text)'::regprocedure))=0 then raise exception 'IMPORTED_TENANT_CONTACT_PATCH_MISSING';end if;
 if position('aqari_contact_channel_allowed' in pg_get_functiondef('private.aqari_reconcile_reminder_queue(uuid)'::regprocedure))=0 then raise exception 'REMINDER_RECONCILE_CONTACT_PATCH_MISSING';end if;
 if position('aqari_contact_channel_allowed' in pg_get_functiondef('private.aqari_v267_prepare_reminders(uuid,date,integer)'::regprocedure))=0 then raise exception 'REMINDER_PREPARE_CONTACT_PATCH_MISSING';end if;
 if position('aqari_preferred_delivery_channel' in pg_get_functiondef('private.aqari_v267_project_state()'::regprocedure))=0 then raise exception 'PAYMENT_THANKS_CONTACT_PATCH_MISSING';end if;
end $$;
rollback;
