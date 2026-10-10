import type { NextRequest } from "next/server";
import { authJSON } from "@/lib/auth/http";
import { isMemberId } from "@/lib/members/model";
import { memberAccess } from "@/lib/members/server";
import {
  GUEST_COLUMNS,
  mapGuests,
  guestMatches,
  guestError,
} from "@/lib/guests/server";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await memberAccess(request);
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!isMemberId(id)) return authJSON({ message: "Guest not found." }, 404);
  try {
    const { data, error } = await access.supabase
      .from("care_guest_submissions")
      .select(GUEST_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) return guestError(error);
    if (!data) return authJSON({ message: "Guest not found." }, 404);
    const [guests, matches] = await Promise.all([
      mapGuests(access.supabase, [data]),
      guestMatches(access.supabase, data),
    ]);
    return authJSON({ guest: guests[0], matches });
  } catch (error) {
    return guestError(error as { code?: string });
  }
}
