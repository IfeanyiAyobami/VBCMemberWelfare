import type { NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { authJSON, preventCaching } from "@/lib/auth/http";
import { uuid, type JourneyReport } from "@/lib/journey/model";
import { reportCsv, reportXlsx } from "@/lib/journey/export";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const validDate = (s: string | null) =>
  !!s &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s + "T12:00:00Z")) &&
  new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;
export async function GET(request: NextRequest) {
  try {
    const client = await createClient();
    const session = await getStaffSession(client);
    if (session.status !== "ready")
      return authJSON({ message: "Active staff access required." }, 403);
    const p = request.nextUrl.searchParams,
      from = p.get("from"),
      to = p.get("to"),
      worker = p.get("worker") || null,
      format = p.get("format") || "json",
      page = Number(p.get("page") || 0);
    if (
      !validDate(from) ||
      !validDate(to) ||
      (worker && !uuid.test(worker)) ||
      !["json", "csv", "xlsx"].includes(format) ||
      !Number.isInteger(page) ||
      page < 0 ||
      page > 100000
    )
      return authJSON(
        { message: "Check the reporting period and worker filter." },
        400,
      );
    const call = async (n: number, limit: number) =>
      client.rpc("care_journey_report", {
        p_from: from,
        p_to: to,
        p_worker: worker,
        p_page: n,
        p_limit: limit,
      });
    let { data, error } = await call(
      format === "json" ? page : 0,
      format === "json" ? 30 : 10000,
    );
    if (error)
      return authJSON(
        {
          message:
            error.code === "42501"
              ? error.message
              : error.code === "22023"
                ? error.message
                : "Unable to load report. Apply migrations 018 and 019.",
        },
        error.code === "42501" ? 403 : error.code === "22023" ? 400 : 503,
      );
    const report = data as JourneyReport;
    if (format === "json") return authJSON(report);
    if (report.total > 10000)
      return authJSON(
        {
          message:
            "This export exceeds 10,000 people. Choose a narrower period or worker filter.",
        },
        413,
      );
    const filename = `VBC_Member_Care_${from}_${to}.${format}`;
    return preventCaching(
      new Response(
        format === "csv"
          ? reportCsv(report)
          : new Uint8Array(reportXlsx(report)),
        {
          headers: {
            "Content-Type":
              format === "csv"
                ? "text/csv; charset=utf-8"
                : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "X-Content-Type-Options": "nosniff",
          },
        },
      ),
    );
  } catch {
    return authJSON(
      { message: "Report service is unavailable. Please try again." },
      503,
    );
  }
}
