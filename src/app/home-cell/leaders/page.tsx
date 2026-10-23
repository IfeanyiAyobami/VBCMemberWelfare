import { redirect } from "next/navigation";
import { actor } from "@/lib/home-cell/admin";
import HomeCellWorkspace from "@/components/home-cell/HomeCellWorkspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const a = await actor(true).catch(() => null);
  if (!a) redirect("/home-cell/login");
  if (a.user.app_metadata?.hco_password_change_required === true) redirect("/home-cell/activate?temporary=1");
  if (!a.churchAdmin && !a.areas.length) redirect("/home-cell");
  return <HomeCellWorkspace section="leaders" />;
}
