-- Local PGlite fixture only. Synthetic content, no hosted connection.
create function extensions.gen_random_uuid() returns uuid language sql volatile as $$select gen_random_uuid()$$;
