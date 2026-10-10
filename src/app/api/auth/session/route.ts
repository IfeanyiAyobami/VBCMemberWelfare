import { getStaffSession } from "@/lib/auth/staff";
import { authJSON } from "@/lib/auth/http";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getStaffSession();
  if (session.status === "ready") return authJSON({ staff: session.staff });
  return authJSON(
    { status: session.status },
    session.status === "unauthenticated"
      ? 401
      : session.status === "forbidden"
        ? 403
        : 503,
  );
}
