import { redirect } from "next/navigation";
import { actor } from "@/lib/home-cell/admin";
import HomeCellWorkspace from "@/components/home-cell/HomeCellWorkspace";
import LeaderApp from "@/components/home-cell/LeaderApp";
import { isLeaderOnly } from "@/lib/home-cell/leader-week";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const a = await actor(true).catch(() => null);
  if (!a) redirect("/home-cell/login");
  if (a.user.app_metadata?.hco_password_change_required === true) redirect("/home-cell/activate?temporary=1");
  const params = await searchParams;
  // v4.12: Cell Leaders and Area Leaders get the simple app; ?full=1 opens the full office.
  if (params.full !== "1" && isLeaderOnly(a.assignments, a.churchAdmin)) return <LeaderApp />;
  return <HomeCellWorkspace section="overview" />;
}
