import type { NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { PayloadError, readJson } from "@/lib/reliability/json";
import { actions, uuid } from "@/lib/journey/model";
export const dynamic = "force-dynamic";
function failure(error: { code?: string; message?: string }) {
  const code = error.code;
  const status =
    code === "42501"
      ? 403
      : code === "40001" || code === "23505"
        ? 409
        : code === "22023" ||
            code?.startsWith("22") ||
            code === "23514" ||
            code === "23502"
          ? 400
          : 503;
  const message =
    code === "23505"
      ? "This entry already exists. Refresh to see the saved record."
      : code === "23514" || code === "23502"
        ? "Check the required fields and allowed values."
        : status === 503
          ? "Journey service is unavailable. Check migrations through 024 and try again."
          : error.message || "Unable to save.";
  return authJSON({ message }, status);
}
export async function GET(request: NextRequest) {
  try {
    const client = await createClient();
    const session = await getStaffSession(client);
    if (session.status !== "ready")
      return authJSON(
        { message: "Sign in with an active staff account." },
        403,
      );
    const id = request.nextUrl.searchParams.get("memberId"),
      search = request.nextUrl.searchParams.get("search") || "",
      page = Number(request.nextUrl.searchParams.get("page") || 0);
    if (
      (id && !uuid.test(id)) ||
      search.length > 120 ||
      !Number.isInteger(page) ||
      page < 0 ||
      page > 100000
    )
      return authJSON({ message: "Invalid search." }, 400);
    const { data, error } = await client.rpc("care_journey_register", {
      p_member: id,
      p_search: search,
      p_page: page,
      p_view: request.nextUrl.searchParams.get("view") || "all",
      p_stage: request.nextUrl.searchParams.get("stage") || "all",
    });
    return error ? failure(error) : authJSON(data);
  } catch {
    return authJSON(
      { message: "Journey service is unavailable. Please try again." },
      503,
    );
  }
}
export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request))
    return authJSON({ message: "Invalid origin." }, 403);
  try {
    const body = await readJson(request, 16384);
    const client = await createClient();
    const session = await getStaffSession(client);
    if (session.status !== "ready")
      return authJSON(
        { message: "Sign in with an active staff account." },
        403,
      );
    if (
      typeof body.action !== "string" ||
      !(actions as readonly string[]).includes(body.action) ||
      typeof body.requestId !== "string" ||
      !uuid.test(body.requestId) ||
      !body.data ||
      typeof body.data !== "object" ||
      Array.isArray(body.data)
    )
      return authJSON({ message: "Invalid journey request." }, 400);
    const { data, error } =
      body.action === "direct"
        ? await client.rpc("care_journey_direct", {
            p_data: body.data,
            p_request: body.requestId,
          })
        : await client.rpc("care_journey_write", {
            p_action: body.action,
            p_data: body.data,
            p_request: body.requestId,
          });
    return error ? failure(error) : authJSON(data);
  } catch (error) {
    return authJSON(
      {
        message:
          error instanceof PayloadError
            ? error.message
            : "Unable to process this request.",
      },
      error instanceof PayloadError ? error.status : 503,
    );
  }
}
