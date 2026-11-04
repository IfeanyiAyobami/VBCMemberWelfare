import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/staff";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { readJson, PayloadError } from "@/lib/reliability/json";
import { uuid } from "@/lib/journey/model";
export const dynamic = "force-dynamic";
async function run(
  member: unknown,
  data: unknown = null,
  requestId: unknown = null,
) {
  if (typeof member !== "string" || !uuid.test(member))
    return authJSON({ message: "Select a person." }, 400);
  const client = await createClient();
  const s = await getStaffSession(client);
  if (s.status !== "ready")
    return authJSON({ message: "Staff access required." }, 403);
  const r = await client.rpc("care_journey_celebration_dates", {
    p_member: member,
    p_data: data,
    p_request: requestId,
  });
  if (r.error)
    return authJSON(
      {
        message:
          r.error.code === "42501"
            ? "Assigned Friend or Coordinator access required."
            : r.error.code?.startsWith("22")
              ? r.error.message
              : "Could not save celebration dates.",
      },
      r.error.code === "42501" ? 403 : 400,
    );
  return authJSON(r.data);
}
export async function GET(req: NextRequest) {
  try {
    return await run(req.nextUrl.searchParams.get("member"));
  } catch {
    return authJSON({ message: "Unable to load dates." }, 503);
  }
}
export async function POST(req: NextRequest) {
  if (!hasSameOrigin(req)) return authJSON({ message: "Invalid origin." }, 403);
  try {
    const b = await readJson(req, 2048);
    if (typeof b.requestId !== "string" || !uuid.test(b.requestId))
      return authJSON({ message: "Invalid request." }, 400);
    return await run(b.member, b.data, b.requestId);
  } catch (e) {
    return authJSON(
      {
        message:
          e instanceof PayloadError ? e.message : "Unable to confirm dates.",
      },
      e instanceof PayloadError ? e.status : 503,
    );
  }
}
