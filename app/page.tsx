import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Root: send signed-in users to the tracker, everyone else to login.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/tracker" : "/login");
}
