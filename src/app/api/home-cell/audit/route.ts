import { withRoute } from "@/lib/home-cell/route";
import { NextRequest } from "next/server";
import { workspaceScope } from "@/lib/home-cell/workspace";
import { authJSON } from "@/lib/auth/http";
import { isMemberId } from "@/lib/members/model";
export const dynamic = "force-dynamic";
async function handleGET(req: NextRequest) {
  try {
    const a = await workspaceScope(req.nextUrl.searchParams.get("scope"));
    const meeting = req.nextUrl.searchParams.get("meeting");
    let cellId: string | null = null;
    if (meeting) {
      if (!isMemberId(meeting))
        return authJSON({ message: "Invalid report" }, 400);
      const r = await a.db
        .from("hco_meetings")
        .select("cell_id")
        .eq("id", meeting)
        .maybeSingle();
      if (r.error || !r.data || !a.cells.some((c) => c.id === r.data?.cell_id))
        return authJSON({ message: "Report access denied" }, 403);
      cellId = r.data.cell_id;
    } else if (!a.churchAdmin && !a.areas.length)
      return authJSON({ message: "Management access required" }, 403);
    let q = a.db
      .from("hco_audit")
      .select("id,action,details,actor_id,target_user_id,created_at")
      .order("id", { ascending: false })
      .limit(250);
    if (cellId) q = q.eq("details->>cell_id", cellId);
    else if (!a.churchAdmin) q = q.eq("actor_id", a.user.id);
    const r = await q;
    if (r.error) throw r.error;
    const permittedCells = new Set(a.cells.map((c) => c.id));
    const rows = (r.data || [])
      .filter((x) => {
        if (a.churchAdmin || meeting) return true;
        const d = x.details;
        const candidates = [d?.before, d?.after].filter(
          (v) => v?.area_id || v?.cell_id,
        );
        return (
          candidates.length > 0 &&
          candidates.every((v) =>
            v.cell_id
              ? permittedCells.has(v.cell_id)
              : a.areas.includes(v.area_id),
          )
        );
      })
      .filter(
        (x) =>
          !meeting ||
          x.details?.after?.id === meeting ||
          x.details?.after?.meeting_id === meeting ||
          x.details?.before?.meeting?.id === meeting,
      );
    return authJSON({ items: rows, limit: 250 });
  } catch {
    return authJSON({ message: "Audit history unavailable" }, 403);
  }
}

export const GET = withRoute("audit", "GET", handleGET);
