import type { NextRequest } from "next/server";
import { authJSON } from "@/lib/auth/http";
import { isMemberId } from "@/lib/members/model";
import {
  validVersion,
  validatePreferences,
  validEvidence,
} from "@/lib/members/care-model";
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
  if (!page) return authJSON({ message: "Check the history page." }, 400);
  try {
    const member = await careMember(access.supabase, id);
    if (!member.ok) return member.response;
    const { data, error, count } = await access.supabase
      .from("care_consent_events")
      .select(
        "id,preference,previous_value,new_value,source,policy_version,evidence_note,recorded_by,recorded_at",
        { count: "exact" },
      )
      .eq("member_id", id)
      .order("recorded_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) return memberDatabaseError(error);
    const authors = await careAuthors(
      access.supabase,
      (data || []).map((row) => row.recorded_by),
    );
    const items = (data || []).map(({ recorded_by, ...row }) => ({
      ...row,
      author:
        authors.get(recorded_by) ||
        (recorded_by ? "Former staff member" : "System"),
    }));
    return authJSON({ items, total: count || 0, page, pageSize });
  } catch {
    return memberDatabaseError({});
  }
}
export async function PATCH(request: NextRequest, context: Context) {
  const access = await memberAccess(request, true);
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!isMemberId(id)) return authJSON({ message: "Member not found." }, 404);
  const payload = await memberPayload(request, "preferences");
  if (!payload.ok) return payload.response;
  const { preferences, evidence, expectedVersion } = payload.data;
  if (
    !validatePreferences(preferences) ||
    !validEvidence(evidence) ||
    !validVersion(expectedVersion)
  )
    return authJSON(
      {
        message:
          "Choose all six permissions and record how and when the member gave or withdrew permission (10–2000 characters). Reload if the preference version is missing.",
      },
      400,
    );
  try {
    const { error } = await access.supabase.rpc(
      "care_update_preferences_guarded",
      {
        p_member_id: id,
        p_preferences: preferences,
        p_expected_version: expectedVersion,
        p_evidence_note: evidence.trim(),
      },
    );
    if (error) return memberDatabaseError(error);
    return authJSON({ saved: true });
  } catch {
    return memberDatabaseError({});
  }
}
