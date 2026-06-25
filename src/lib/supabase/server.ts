import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the anon key.
 * Used for normal CRUD operations from Server Components / Route Handlers.
 * RLS still applies — for service-role access use ./admin.ts instead.
 */
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
