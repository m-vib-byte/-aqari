-- In-memory negative fixture: simulate concurrent changes after preflight.
alter function private.aqari_refresh_rent_due_schedule(uuid,uuid) stable;
