import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CfcDashboard from "@/components/CfcDashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const c = await createClient();
  const { data, error } = await c.rpc("care_cfc_read", { p_search: "" });
  if (error?.code === "42501") redirect("/cfc-login");
  if (error)
    return (
      <main>
        <h1>Foundational Classes</h1>
        <p>CFC service is unavailable. Check migration 031 and refresh.</p>
        <a href="/cfc-login">Sign in</a>
      </main>
    );
  return <CfcDashboard initial={data} />;
}
