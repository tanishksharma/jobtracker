import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginButton from "./LoginButton";

const configured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function LoginPage() {
  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/tracker");
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Job Tracker</h1>
        <p>Your company-research tracker, in the cloud.</p>
        {configured ? (
          <LoginButton />
        ) : (
          <p className="login-note">
            Not configured yet. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your environment to
            enable sign-in.
          </p>
        )}
        <p className="login-note">
          Sign-in is currently limited to approved test users.
        </p>
      </div>
    </div>
  );
}
