-- AQARI V267 staging hardening.
-- Keep private authorization/settlement tables inaccessible to direct API roles.
-- SECURITY DEFINER functions owned by postgres remain the only intended access path.

alter table if exists private.aqari_allowed_users
  enable row level security;

alter table if exists private.aqari_vacating_settlements
  enable row level security;

revoke all on table private.aqari_allowed_users
  from public, anon, authenticated;

revoke all on table private.aqari_vacating_settlements
  from public, anon, authenticated;
