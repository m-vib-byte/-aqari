# Aqari V167 Secure Cloud Onboarding

V167 keeps Aqari working in Local Safe Mode while preparing production authentication with Supabase.

## Security boundaries

- The browser accepts only the Supabase project URL and a publishable/legacy anon key.
- Service-role and secret keys are rejected and must never be placed in index.html.
- Cloud sessions are kept in sessionStorage, not permanent localStorage.
- Database access is denied to anon; authenticated access is restricted by RLS.
- User role and activation changes are not writable by ordinary authenticated users.

## Production activation

1. Connect the Supabase integration.
2. Apply supabase/migrations/20260902050000_v167_secure_cloud.sql.
3. Create the first user through the Supabase Auth administration surface.
4. Assign that user general_manager using a trusted server/admin context.
5. In Aqari, open “إعداد الربط الآمن” and enter only the project URL and publishable key.
6. Test authentication and verify RLS before moving property or tenant data.

## Verification gate

- Static HTML and every inline JavaScript block parse successfully.
- Local Safe Mode loads without Supabase configuration.
- Service-role-like keys are rejected in the browser.
- Preview deployment loads V167 with no page console errors.
- Cloud authentication and database queries remain blocked from release approval until a real Supabase project is connected and the migration is verified.
