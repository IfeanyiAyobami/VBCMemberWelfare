import { getStaffSession } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { authJSON } from "@/lib/auth/http";
import { adminDb } from "@/lib/home-cell/admin";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await getStaffSession(await createClient());
    if (session.status !== "ready")
      return authJSON({ message: "Sign in to your Friend dashboard." }, 403);
    // Service access is narrowed to the verified actor's assignments; no caller-supplied IDs.
    const r = await adminDb()
      .from("care_journeys")
      .select(
        "member_id,care_members!inner(other_names,surname,birthday_month,birthday_day,anniversary_month,anniversary_day,care_preferences(contact_consent,celebrations_opt_in))",
      )
      .eq("assigned_to", session.staff.user_id);
    if (r.error) throw Error();
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      month: "numeric",
      day: "numeric",
    }).formatToParts(new Date());
    const month = Number(parts.find((p) => p.type === "month")?.value),
      day = Number(parts.find((p) => p.type === "day")?.value);
    const items: Array<{ memberId: string; name: string; kind: string }> = [];
    for (const row of r.data || []) {
      const m = Array.isArray(row.care_members)
        ? row.care_members[0]
        : row.care_members;
      if (!m) continue;
      const prefs = Array.isArray(m.care_preferences)
        ? m.care_preferences[0]
        : m.care_preferences;
      if (!prefs?.contact_consent || !prefs?.celebrations_opt_in) continue;
      for (const [kind, mo, da] of [
        ["Birthday", m.birthday_month, m.birthday_day],
        ["Wedding anniversary", m.anniversary_month, m.anniversary_day],
      ])
        if (Number(mo) === month && Number(da) === day)
          items.push({
            memberId: row.member_id,
            name: `${m.other_names} ${m.surname}`,
            kind: String(kind),
          });
    }
    return authJSON({ items });
  } catch {
    return authJSON({ message: "Celebrations could not be loaded." }, 503);
  }
}
