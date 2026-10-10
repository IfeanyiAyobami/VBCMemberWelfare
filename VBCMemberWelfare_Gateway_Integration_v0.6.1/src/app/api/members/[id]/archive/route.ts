import type { NextRequest } from "next/server";
import { authJSON } from "@/lib/auth/http";
import { isMemberId } from "@/lib/members/model";
import { validVersion } from "@/lib/members/care-model";
import {
  memberAccess,
  memberPayload,
  memberDatabaseError,
  MEMBER_COLUMNS,
  mapMember,
} from "@/lib/members/server";
export const dynamic = "force-dynamic";
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await memberAccess(request, true);
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!isMemberId(id)) return authJSON({ message: "Member not found." }, 404);
  const payload = await memberPayload(request, "archive");
  if (!payload.ok) return payload.response;
  const { archived, expectedVersion } = payload.data;
  if (typeof archived !== "boolean" || !validVersion(expectedVersion))
    return authJSON(
      { message: "Reload the profile before changing its archive status." },
      400,
    );
  try {
    const { data, error } = await access.supabase
      .from("care_members")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("updated_at", expectedVersion)
      .select(MEMBER_COLUMNS)
      .maybeSingle();
    if (error) return memberDatabaseError(error);
    if (data) return authJSON({ member: mapMember(data) });
    const current = await access.supabase
      .from("care_members")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (current.error) return memberDatabaseError(current.error);
    return current.data
      ? memberDatabaseError({ code: "40001" })
      : authJSON({ message: "Member not found." }, 404);
  } catch {
    return memberDatabaseError({});
  }
}
