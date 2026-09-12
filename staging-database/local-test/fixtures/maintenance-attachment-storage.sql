-- In-memory harness only: mirror existing Supabase Storage columns and grants.
-- This file must never be applied to a hosted database.
alter table storage.buckets add column if not exists file_size_limit bigint;
alter table storage.buckets add column if not exists allowed_mime_types text[];
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
