import type { NextRequest } from "next/server";
import { authJSON } from "@/lib/auth/http";
import { isMemberId } from "@/lib/members/model";
import { validNote } from "@/lib/members/care-model";
import {
  memberAccess,
  memberPayload,
  memberDatabaseError,
} from "@/lib/members/server";
import {
  careMember,
  carePageParam,
  careAuthors,
} from "@/lib/members/care-server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  const access = await memberAccess(request);
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!isMemberId(id)) return authJSON({ message: "Member not found." }, 404);
  const page = carePageParam(request.nextUrl.searchParams.get("page")),
    pageSize = 20;
  if (!page) return authJSON({ message: "Check the notes page." }, 400);
  try {
    const member = await careMember(access.supabase, id);
    if (!member.ok) return member.response;
    const { data, error, count } = await access.supabase
      .from("care_notes")
      .select("id,body,created_by,created_at", { count: "exact" })
      .eq("member_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) return memberDatabaseError(error);
    const authors = await careAuthors(
      access.supabase,
      (data || []).map((row) => row.created_by),
    );
    return authJSON({
      items: (data || []).map(({ created_by, ...row }) => ({
        ...row,
        author: authors.get(created_by) || "Former staff member",
      })),
      total: count || 0,
      page,
      pageSize,
    });
  } catch {
    return memberDatabaseError({});
  }
}
export async function POST(request: NextRequest, context: Context) {
  const access = await memberAccess(request, true);
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!isMemberId(id)) return authJSON({ message: "Member not found." }, 404);
  const payload = await memberPayload(request, "note");
  if (!payload.ok) return payload.response;
  const { body, requestId } = payload.data;
  if (!validNote(body) || !isMemberId(requestId))
    return authJSON(
      { message: "Enter a care note of 1–4000 characters." },
      400,
    );
  try {
    const { error } = await access.supabase.rpc("care_add_note_guarded", {
      p_member_id: id,
      p_request_id: requestId,
      p_body: body.trim(),
    });
    if (error?.code === "23505")
      return authJSON(
        {
          message:
            "This note request was already used for other details. Reload before adding a new note.",
        },
        409,
      );
    if (error) return memberDatabaseError(error);
    return authJSON({ saved: true }, 201);
  } catch {
    return memberDatabaseError({});
  }
}
