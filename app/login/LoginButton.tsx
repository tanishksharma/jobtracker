"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginButton() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setLoading(false);
      alert("Sign-in failed: " + error.message);
    }
  }

  return (
    <button className="btn btn-primary" onClick={signIn} disabled={loading}>
      {loading ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}
