import type { NextRequest } from "next/server";
import { authJSON } from "@/lib/auth/http";
import { memberAccess } from "@/lib/members/server";
import { carePageParam } from "@/lib/members/care-server";
import {
  validateGuest,
  validGuestEnvelope,
  guestColumns,
  GUEST_STATUSES,
} from "@/lib/guests/model";
import {
  GUEST_COLUMNS,
  guestPayload,
  mapGuests,
  guestError,
} from "@/lib/guests/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const access = await memberAccess(request);
  if (!access.ok) return access.response;
  const page = carePageParam(request.nextUrl.searchParams.get("page")),
    status = request.nextUrl.searchParams.get("status") || "pending",
    q = request.nextUrl.searchParams.get("q") || "",
    pageSize = 20;
  if (
    !page ||
    (status !== "all" && !Object.hasOwn(GUEST_STATUSES, status)) ||
    q.length > 120
  )
    return authJSON({ message: "Check the guest filters." }, 400);
  try {
    let query = access.supabase
      .from("care_guest_submissions")
      .select(GUEST_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (status !== "all") query = query.eq("review_status", status);
    const literal = q.replace(/[^\p{L}\p{N}\s@.+'-]/gu, "").trim();
    if (q.trim() && !literal)
      return authJSON(
        { message: "Search by guest name, email or phone." },
        400,
      );
    if (literal)
      query = query.or(
        ["surname", "other_names", "email", "phone"]
          .map((c) => c + ".ilike.%" + literal + "%")
          .join(","),
      );
    const { data, error, count } = await query.range(
      (page - 1) * pageSize,
      page * pageSize - 1,
    );
    if (error) return guestError(error);
    return authJSON({
      items: await mapGuests(access.supabase, data || []),
      total: count || 0,
      page,
      pageSize,
    });
  } catch (error) {
    return guestError(error as { code?: string });
  }
}
export async function POST(request: NextRequest) {
  const access = await memberAccess(request, true);
  if (!access.ok) return access.response;
  const payload = await guestPayload(request);
  if (!payload.ok) return payload.response;
  const validation = validateGuest(payload.data);
  if (!validation.ok)
    return authJSON(
      {
        message: "Check the highlighted guest fields.",
        errors: validation.errors,
      },
      400,
    );
  if (!validGuestEnvelope(payload.data))
    return authJSON(
      {
        message:
          "Record consent evidence (10–2000 characters), then try again.",
      },
      400,
    );
  try {
    const { data, error } = await access.supabase.rpc("care_record_guest", {
      p_submission_key: payload.data.requestId,
      p_guest: guestColumns(validation.value),
      p_evidence: (payload.data.evidence as string).trim(),
    });
    if (error) return guestError(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return guestError({});
    return authJSON(
      { guest: (await mapGuests(access.supabase, [row]))[0] },
      201,
    );
  } catch (error) {
    return guestError(error as { code?: string });
  }
}
