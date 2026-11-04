import type { NextRequest } from "next/server";
import { authJSON } from "@/lib/auth/http";
import { memberAccess } from "@/lib/members/server";
import { isMemberId } from "@/lib/members/model";

export const dynamic = "force-dynamic";

/** Records that a staff member greeted someone from their own phone. Stores no message text. */
export async function POST(request: NextRequest) {
  const access = await memberAccess(request, true);
  if (!access.ok) return access.response;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return authJSON({ message: "Check the greeting details." }, 400);
  }
  const memberId = String(body.memberId || ""),
    occasion = String(body.occasion || ""),
    channel = String(body.channel || "whatsapp"),
    year = Number(body.year);
  if (
    !isMemberId(memberId) ||
    !["birthday", "anniversary"].includes(occasion) ||
    !["whatsapp", "phone", "sms", "in_person", "other"].includes(channel) ||
    !Number.isInteger(year) ||
    year < 2020 ||
    year > 2200
  )
    return authJSON({ message: "Check the greeting details." }, 400);
  try {
    const { data, error } = await access.supabase
      .from("care_celebration_greetings")
      .insert({ member_id: memberId, occasion, occasion_year: year, channel })
      .select("member_id,occasion,occasion_year,channel,greeted_by_name,greeted_at")
      .single();
    if (error?.code === "23505") {
      const existing = await access.supabase
        .from("care_celebration_greetings")
        .select("member_id,occasion,occasion_year,channel,greeted_by_name,greeted_at")
        .eq("member_id", memberId)
        .eq("occasion", occasion)
        .eq("occasion_year", year)
        .maybeSingle();
      return authJSON({ saved: false, already: true, greeting: existing.data || null });
    }
    if (error?.code === "42P01")
      return authJSON({ message: "Greeting records are not set up yet. Run migration 026." }, 503);
    if (error)
      return authJSON(
        { message: error.code === "42501" ? "Your role cannot record greetings." : "Could not record the greeting." },
        error.code === "42501" ? 403 : 503,
      );
    return authJSON({ saved: true, greeting: data });
  } catch {
    return authJSON({ message: "Could not record the greeting." }, 503);
  }
}
