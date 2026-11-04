import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/staff";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { readJson, PayloadError } from "@/lib/reliability/json";
export const dynamic = "force-dynamic";
async function run(row: number | null) {
  const client = await createClient();
  const session = await getStaffSession(client);
  if (session.status !== "ready")
    return authJSON({ message: "Active staff access required." }, 403);
  const r = await client.rpc("care_historical_guests", { p_row: row });
  if (r.error)
    return authJSON(
      {
        message:
          r.error.code === "42501"
            ? "Coordinator access required."
            : "Historical import unavailable. Check migration 025 and the private workbook seed.",
      },
      r.error.code === "42501" ? 403 : 503,
    );
  return authJSON(r.data);
}
export async function GET() {
  try {
    return await run(null);
  } catch {
    return authJSON({ message: "Unable to load historical guests." }, 503);
  }
}
export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request))
    return authJSON({ message: "Invalid origin." }, 403);
  try {
    const body = await readJson(request, 2048);
    if (
      typeof body.row !== "number" ||
      !Number.isInteger(body.row) ||
      body.row < 2 ||
      body.row > 10000
    )
      return authJSON({ message: "Invalid source row." }, 400);
    return await run(body.row);
  } catch (e) {
    return authJSON(
      {
        message:
          e instanceof PayloadError
            ? e.message
            : "Could not confirm this row. Retry safely.",
      },
      e instanceof PayloadError ? e.status : 503,
    );
  }
}
