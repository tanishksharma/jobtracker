"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Uses the public env vars, which are safe to
// expose; Row Level Security in the database is what actually protects data.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
