import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EDITABLE_KEYS } from "@/lib/columns";
import TrackerClient, { type Company } from "./TrackerClient";

export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <TrackerClient
      initialCompanies={(companies as Company[]) ?? []}
      userEmail={user.email ?? ""}
      editableKeys={EDITABLE_KEYS}
    />
  );
}
