import { notFound, redirect } from "next/navigation";
import CareApp from "@/components/CareApp";
import MemberDesk from "@/components/MemberDesk";
import StaffAccess from "@/components/StaffAccess";
import { isCareRoute } from "@/lib/routes";
import { getStaffSession } from "@/lib/auth/staff";
import { isMemberId } from "@/lib/members/model";

export const dynamic = "force-dynamic";

export default async function CarePage({
  params,
}: {
  params: Promise<{ screen?: string[] }>;
}) {
  const { screen = [] } = await params;
  const path = screen.join("/");
  if (!isCareRoute(path)) notFound();
  const session = await getStaffSession();
  if (session.status === "configuration")
    return <StaffAccess configurationMessage={session.message} />;
  if (session.status === "unavailable")
    return (
      <StaffAccess initialMessage="We cannot verify staff access right now. Please try again shortly." />
    );
  if (session.status === "forbidden") redirect("/access?reason=staff");
  if (session.status === "unauthenticated")
    redirect("/access?next=" + encodeURIComponent("/" + (path || "overview")));
  if (path === "guests") return <MemberDesk staff={session.staff} guestMode />;
  if (screen[0] === "guest" && isMemberId(screen[1]))
    return <MemberDesk staff={session.staff} guestMode guestId={screen[1]} />;
  if (path === "members") return <MemberDesk staff={session.staff} />;
  if (screen[0] === "profile" && isMemberId(screen[1]))
    return <MemberDesk staff={session.staff} memberId={screen[1]} />;
  return <CareApp staff={session.staff} />;
}
