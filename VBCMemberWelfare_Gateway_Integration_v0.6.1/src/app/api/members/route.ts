import type { NextRequest } from "next/server";
import { authJSON } from "@/lib/auth/http";
import {
  MEMBER_STATUSES,
  isMemberId,
  validateMemberDraft,
  memberColumns,
} from "@/lib/members/model";
import {
  memberAccess,
  memberPayload,
  MEMBER_COLUMNS,
  mapMember,
  memberDatabaseError,
} from "@/lib/members/server";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await memberAccess(request);
  if (!access.ok) return access.response;
  const params = request.nextUrl.searchParams;
  const rawPage = params.get("page") ?? "1",
    status = params.get("status") ?? "all",
    search = params.get("q") ?? "",
    scope = params.get("scope") ?? "active";
  if (
    !/^\d{1,6}$/.test(rawPage) ||
    Number(rawPage) < 1 ||
    Number(rawPage) > 100000 ||
    (status !== "all" && !Object.hasOwn(MEMBER_STATUSES, status)) ||
    search.length > 120 ||
    !["active", "archived"].includes(scope)
  )
    return authJSON({ message: "Check the search and page filters." }, 400);
  const page = Number(rawPage),
    pageSize = 20;
  try {
    let query = access.supabase
      .from("care_members")
      .select(MEMBER_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    query =
      scope === "active"
        ? query.is("archived_at", null)
        : query.not("archived_at", "is", null);
    if (status !== "all") query = query.eq("status", status);
    // Restrict PostgREST filter syntax to literal search characters, never caller-supplied operators.
    const literal = search.replace(/[^\p{L}\p{N}\s@.+'-]/gu, "").trim();
    if (search.trim() && !literal)
      return authJSON(
        { message: "Search by a name, email or phone number." },
        400,
      );
    if (literal)
      query = query.or(
        ["surname", "other_names", "email", "phone"]
          .map((column) => `${column}.ilike.%${literal}%`)
          .join(","),
      );
    const { data, count, error } = await query.range(
      (page - 1) * pageSize,
      page * pageSize - 1,
    );
    if (error) return memberDatabaseError(error);
    return authJSON({
      members: (data || []).map(mapMember),
      total: count || 0,
      page,
      pageSize,
    });
  } catch {
    return memberDatabaseError({});
  }
}

export async function POST(request: NextRequest) {
  const access = await memberAccess(request, true);
  if (!access.ok) return access.response;
  const payload = await memberPayload(request, "create");
  if (!payload.ok) return payload.response;
  if (!isMemberId(payload.data.requestId))
    return authJSON({ message: "Reopen the form and try again." }, 400);
  const validation = validateMemberDraft(payload.data);
  if (!validation.ok)
    return authJSON(
      { message: "Check the highlighted fields.", errors: validation.errors },
      400,
    );
  const columns = memberColumns(validation.value),
    id = payload.data.requestId.toLowerCase();
  try {
    const { data, error } = await access.supabase
      .from("care_members")
      .insert({ id, ...columns, created_by: access.staff.user_id })
      .select(MEMBER_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") {
        // A stable form request ID prevents a network retry from creating a second member.
        // An existing contact on another ID is a conflict, never an automatic merge.
        const existing = await access.supabase
          .from("care_members")
          .select(MEMBER_COLUMNS)
          .eq("id", id)
          .is("archived_at", null)
          .maybeSingle();
        const row = existing.data;
        if (
          !existing.error &&
          row &&
          row.created_by === access.staff.user_id &&
          Object.entries(columns).every(
            ([key, value]) => row[key as keyof typeof columns] === value,
          )
        )
          return authJSON({ member: mapMember(row), replayed: true });
      }
      return memberDatabaseError(error);
    }
    return authJSON({ member: mapMember(data) }, 201);
  } catch {
    return memberDatabaseError({});
  }
}
