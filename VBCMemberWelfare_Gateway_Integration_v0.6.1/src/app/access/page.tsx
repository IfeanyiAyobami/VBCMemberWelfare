import { redirect } from "next/navigation";
import StaffAccess from "@/components/StaffAccess";
import { getStaffSession } from "@/lib/auth/staff";
import { safeNextPath } from "@/lib/auth/http";
export const dynamic = "force-dynamic";

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const session = await getStaffSession();
  if (session.status === "ready") redirect(next);
  return (
    <StaffAccess
      next={next}
      configurationMessage={
        session.status === "configuration" ? session.message : ""
      }
      initialMessage={
        session.status === "unavailable"
          ? "We cannot verify staff access right now. Please try again shortly."
          : session.status === "forbidden" || params.reason === "staff"
            ? "This account does not have active staff access. Contact your church administrator."
            : params.reason === "expired"
              ? "Your session ended. Please sign in again."
              : ""
      }
    />
  );
}
