import { notFound, redirect } from "next/navigation";
import { actor } from "@/lib/home-cell/admin";
import { sections, type Section } from "@/lib/home-cell/model";
import HomeCellWorkspace from "@/components/home-cell/HomeCellWorkspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section as Section)) notFound();
  const a = await actor(true).catch(() => null);
  if (!a) redirect("/home-cell/login");
  if (a.user.app_metadata?.hco_password_change_required === true) redirect("/home-cell/activate?temporary=1");
  return <HomeCellWorkspace section={section as Section} />;
}
