import type { NextRequest } from "next/server";
import { authJSON } from "@/lib/auth/http";
import { isMemberId } from "@/lib/members/model";
import { validVersion } from "@/lib/members/care-model";
import { memberAccess } from "@/lib/members/server";
import { guestPayload, mapGuests, guestError } from "@/lib/guests/server";
export const dynamic = "force-dynamic";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await memberAccess(request, true);
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!isMemberId(id)) return authJSON({ message: "Guest not found." }, 404);
  const payload = await guestPayload(request, true);
  if (!payload.ok) return payload.response;
  const {
    action,
    memberId,
    targetVersion,
    expectedVersion,
    notes,
    identityConfirmed,
  } = payload.data;
  if (
    typeof action !== "string" ||
    !["create", "link", "reject"].includes(action) ||
    !validVersion(expectedVersion) ||
    typeof notes !== "string" ||
    notes.trim().length > 2000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notes) ||
    typeof identityConfirmed !== "boolean" ||
    (action === "reject"
      ? memberId !== null || notes.trim().length < 10
      : !isMemberId(memberId)) ||
    (action === "link"
      ? !validVersion(targetVersion) || !identityConfirmed
      : targetVersion !== null)
  )
    return authJSON(
      {
        message:
          "Check the decision. Linking requires a current matching record and identity confirmation; rejection requires a reason of at least 10 characters.",
      },
      400,
    );
  try {
    const { data, error } = await access.supabase.rpc("care_review_guest", {
      p_guest_id: id,
      p_expected_version: expectedVersion,
      p_action: action,
      p_member_id: memberId,
      p_target_version: targetVersion,
      p_review_notes: notes.trim(),
      p_identity_confirmed: identityConfirmed,
    });
    if (error) return guestError(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return guestError({});
    return authJSON({ guest: (await mapGuests(access.supabase, [row]))[0] });
  } catch (error) {
    return guestError(error as { code?: string });
  }
}
