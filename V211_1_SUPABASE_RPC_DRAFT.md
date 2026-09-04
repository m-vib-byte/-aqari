# V211.1 Supabase follow-up RPC

Status: applied to production as migration `20260904205555_v211_1_secure_follow_up_cloud_rpc`.

Executable source: `supabase/migrations/20260904205555_v211_1_secure_follow_up_cloud_rpc.sql`.

The contract accepts no property name, tenant identity, contact data, note, reminder body, or raw V202 key. Public RPCs are `SECURITY INVOKER`; privileged implementations are isolated in non-exposed `aqari_internal` with an empty `search_path`. Anonymous execution and direct browser access to `aqari_access_audit` remain denied.
