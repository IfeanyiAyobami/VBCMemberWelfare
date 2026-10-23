import { withRoute } from "@/lib/home-cell/route";
import {publicLoginEmail} from "@/lib/home-cell/phone-usernames";
import { NextRequest } from "next/server";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { workspaceScope } from "@/lib/home-cell/workspace";
import { normalizeMemberPhone, validMilestone } from "@/lib/members/model";
export const dynamic = "force-dynamic";
async function handleGET(req: NextRequest) {
  try {
    const a = await workspaceScope(req.nextUrl.searchParams.get("scope"));
    const from =
      req.nextUrl.searchParams.get("from") ||
      new Date().toISOString().slice(0, 8) + "01";
    const to =
      req.nextUrl.searchParams.get("to") ||
      new Date().toISOString().slice(0, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      from > to
    )
      return authJSON({ message: "Choose a valid date range" }, 400);
    const filteredCells = a.cells.filter(
      (c) =>
        (!req.nextUrl.searchParams.get("cell") ||
          c.id === req.nextUrl.searchParams.get("cell")) &&
        (!req.nextUrl.searchParams.get("area") ||
          c.area_id === req.nextUrl.searchParams.get("area")),
    );
    const ids = filteredCells.map((c) => c.id),
      areaIds = [...new Set(a.cells.map((c) => c.area_id))];
    const limit = 5000;
    const [areas, memberships, meetings, visits, announcements] =
      await Promise.all([
        a.db
          .from("hco_areas")
          .select("id,name", { count: "exact" })
          .in("id", areaIds)
          .order("name"),
        a.db
          .from("hco_member_cells")
          .select(
            "id,member_id,cell_id,care_members(id,other_names,surname,phone,email,status)",
            { count: "exact" },
          )
          .eq("active", true)
          .in("cell_id", ids)
          .limit(limit),
        a.db
          .from("hco_meetings")
          .select("*", { count: "exact" })
          .in("cell_id", ids)
          .gte("meeting_date", from)
          .lte("meeting_date", to)
          .order("meeting_date", { ascending: false })
          .limit(limit),
        a.db
          .from("hco_visits")
          .select(
            "*,care_members(id,other_names,surname,phone,email,status),care_guest_submissions(id,other_names,surname,phone,email)",
            { count: "exact" },
          )
          .in("cell_id", ids)
          .gte("visited_at", from + "T00:00:00+01:00")
          .lte("visited_at", to + "T23:59:59.999+01:00")
          .order("visited_at", { ascending: false })
          .limit(limit),
        a.db
          .from("hco_announcements")
          .select("*", { count: "exact" })
          .or(
            [
              "and(area_id.is.null,cell_id.is.null)",
              ...(ids.length ? [`cell_id.in.(${ids.join(",")})`] : []),
              ...(areaIds.length ? [`area_id.in.(${areaIds.join(",")})`] : []),
            ].join(","),
          )
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);
    const results = [areas, memberships, meetings, visits, announcements];
    if (results.some((r) => r.error)) {
      const missing = results.some(
        (r) =>
          r.error?.code === "42P01" ||
          r.error?.code === "42703" ||
          r.error?.code === "PGRST204",
      );
      return authJSON(
        {
          message: missing
            ? "Run migration 011 before opening the new workspace."
            : "Workspace data is unavailable. Check server configuration and database access.",
        },
        503,
      );
    }
    if (
      results.some(
        (r) =>
          (r.data?.length || 0) >= limit ||
          (r.count !== null && r.count > (r.data?.length || 0)),
      )
    )
      return authJSON(
        {
          message:
            "This range contains too many records. Choose a shorter date range.",
        },
        422,
      );
    const meetingIds = meetings.data?.map((m) => m.id) || [];
    const [attendance, finances, corrections] = await Promise.all([
      a.db
        .from("hco_attendance")
        .select("*", { count: "exact" })
        .in("meeting_id", meetingIds)
        .limit(limit),
      a.db
        .from("hco_finances")
        .select("*", { count: "exact" })
        .in("meeting_id", meetingIds)
        .order("created_at", { ascending: false })
        .limit(limit),
      a.db
        .from("hco_corrections")
        .select("*", { count: "exact" })
        .in("meeting_id", meetingIds)
        .order("requested_at", { ascending: false })
        .limit(limit),
    ]);
    if ([attendance, finances, corrections].some((r) => r.error))
      throw Error("DATA_UNAVAILABLE");
    if (
      [attendance, finances, corrections].some(
        (r) =>
          (r.data?.length || 0) >= limit ||
          (r.count !== null && r.count > (r.data?.length || 0)),
      )
    )
      return authJSON(
        { message: "Choose a shorter range to load complete records." },
        422,
      );
    return authJSON({
      email: publicLoginEmail(a.user.email) || a.user.app_metadata?.hco_phone_username || a.user.phone || "Leadership workspace",
      churchAdmin: a.churchAdmin,
      manager: a.manager,
      assignments: a.assignments,
      scope: a.scope,
      areas: areas.data,
      cells: a.cells,
      memberships: memberships.data,
      meetings: meetings.data,
      attendance: attendance.data,
      finances: finances.data,
      visits: visits.data,
      corrections: corrections.data,
      announcements: announcements.data,
      from,
      to,
    });
  } catch (e) {
    return authJSON(
      {
        message:
          e instanceof Error &&
          ["UNAUTHENTICATED", "FORBIDDEN", "SUSPENDED"].includes(e.message)
            ? "Please sign in with active Home Cell access."
            : "Workspace unavailable. Check Supabase server configuration.",
      },
      403,
    );
  }
}
async function handlePOST(req: NextRequest) {
  if (!hasSameOrigin(req)) return authJSON({ message: "Invalid origin" }, 403);
  try {
    const a = await workspaceScope(req.nextUrl.searchParams.get("scope"));
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > 32768)
      return authJSON({ message: "Request too large" }, 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return authJSON({ message: "Invalid request" }, 400);
    const actions = [
      "meeting",
      "attendance",
      "finance",
      "void_finance",
      "submit",
      "approve",
      "correction",
      "assign_member",
      "visitor",
      "followup",
      "announcement",
      "cell",
    ];
    if (!actions.includes(body.action))
      return authJSON({ message: "Unsupported action" }, 400);
    if (
      body.action === "visitor" &&
      !body.member_id &&
      !body.guest_submission_id
    ) {
      const phone =
        typeof body.phone === "string"
          ? normalizeMemberPhone(body.phone)
          : null;
      if (!phone)
        return authJSON({ message: "Enter a valid phone number" }, 400);
      body.phone = phone;
      if (body.whatsapp) {
        const w =
          typeof body.whatsapp === "string"
            ? normalizeMemberPhone(body.whatsapp)
            : null;
        if (!w)
          return authJSON(
            { message: "Enter a valid WhatsApp number or leave it blank." },
            400,
          );
        body.whatsapp = w;
      }
      for (const key of ["birthday", "anniversary"])
        if (body[key] && !validMilestone(body[key]))
          return authJSON(
            { message: "Use MM-DD for birthday and anniversary." },
            400,
          );
    }
    const cell = body.cell_id
      ? a.cells.find((c) => c.id === body.cell_id)
      : null;
    if (body.cell_id && !cell && body.action !== "cell")
      return authJSON({ message: "Outside your workspace" }, 403);
    if(body.action === "assign_member") return authJSON({message:"Use Members → Find existing member to preview the assignment or submit a transfer request."},409);
    const { data, error } = await a.db.rpc("hco_workspace_write", {
      p_actor: a.user.id,
      p_action: body.action,
      p_data: body,
    });
    if (error)
      return authJSON(
        {
          message:
            error.code === "42883" || error.code === "PGRST202"
              ? "Run migration 011 to enable this workflow."
              : error.message.includes("HCO_")
                ? error.message
                : "Unable to save. Check fields and refresh before retrying.",
        },
        error.code === "42501" ? 403 : 409,
      );
    return authJSON({ ok: true, result: data });
  } catch {
    return authJSON(
      { message: "Unable to save. Check access and request fields." },
      403,
    );
  }
}

export const GET = withRoute("workspace", "GET", handleGET);
export const POST = withRoute("workspace", "POST", handlePOST);
