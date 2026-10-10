import {createHandler} from './gateway.mjs';

// verify_jwt=false is required for non-Supabase JWTs. The handler validates the
// Vercel RS256 signature, issuer, audience, subject, stable IDs and environment,
// then independently verifies the real user before its single allowed commit.
Deno.serve(createHandler({getEnv: (name: string) => Deno.env.get(name)}));
