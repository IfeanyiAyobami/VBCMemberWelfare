import type { NextRequest } from "next/server";
import { authJSON } from "@/lib/auth/http";
import {
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
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const access = await memberAccess(request);
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!isMemberId(id)) return authJSON({ message: "Member not found." }, 404);
  try {
    let query = access.supabase
      .from("care_members")
      .select(MEMBER_COLUMNS)
      .eq("id", id);
    if (request.nextUrl.searchParams.get("includeArchived") !== "1")
      query = query.is("archived_at", null);
    const { data, error } = await query.maybeSingle();
    if (error) return memberDatabaseError(error);
    return data
      ? authJSON({ member: mapMember(data) })
      : authJSON({ message: "Member not found." }, 404);
  } catch {
    return memberDatabaseError({});
  }
}
export async function PATCH(request: NextRequest, context: Context) {
  const access = await memberAccess(request, true);
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!isMemberId(id)) return authJSON({ message: "Member not found." }, 404);
  const payload = await memberPayload(request, "update");
  if (!payload.ok) return payload.response;
  const version = payload.data.expectedVersion;
  if (
    typeof version !== "string" ||
    version.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(version) ||
    !Number.isFinite(Date.parse(version))
  )
    return authJSON(
      { message: "Reload the member before saving changes." },
      400,
    );
  const validation = validateMemberDraft(payload.data);
  if (!validation.ok)
    return authJSON(
      { message: "Check the highlighted fields.", errors: validation.errors },
      400,
    );
  try {
    const { data, error } = await access.supabase
      .from("care_members")
      .update(memberColumns(validation.value))
      .eq("id", id)
      .is("archived_at", null)
      .eq("updated_at", version)
      .select(MEMBER_COLUMNS)
      .maybeSingle();
    if (error) return memberDatabaseError(error);
    if (data) return authJSON({ member: mapMember(data) });
    const current = await access.supabase
      .from("care_members")
      .select("id")
      .eq("id", id)
      .is("archived_at", null)
      .maybeSingle();
    if (current.error) return memberDatabaseError(current.error);
    return current.data
      ? authJSON(
          {
            message:
              "This member changed after you opened the form. Copy any unsaved changes before closing this form, then reload the latest profile and reapply them.",
          },
          409,
        )
      : authJSON({ message: "Member not found." }, 404);
  } catch {
    return memberDatabaseError({});
  }
}
