import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/staff";
import HistoricalGuests from "@/components/HistoricalGuests";
export const dynamic = "force-dynamic";
export default async function Page() {
  const s = await getStaffSession();
  if (s.status !== "ready") redirect("/access?next=/historical-guests");
  return <HistoricalGuests />;
}
