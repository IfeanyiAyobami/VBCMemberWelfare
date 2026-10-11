import type { NextRequest } from "next/server";
import { authJSON } from "@/lib/auth/http";
import { memberAccess } from "@/lib/members/server";

export const dynamic = "force-dynamic";

/** Read-only, staff-authenticated milestone directory. No birth year or private notes. */
export async function GET(request: NextRequest) {
  const access = await memberAccess(request);
  if (!access.ok) return access.response;
  const members: Array<Record<string, unknown>> = [];
  const pageSize = 500;
  try {
    for (let start = 0; start < 20000; start += pageSize) {
      const { data, error } = await access.supabase
        .from("care_members")
        .select("id,other_names,surname,status,birthday_month,birthday_day,anniversary_month,anniversary_day,created_at,care_preferences(celebrations_opt_in,email_opt_in,sms_opt_in)")
        .is("archived_at", null)
        .order("id", { ascending: true })
        .range(start, start + pageSize - 1);
      if (error) return authJSON({ message: "Could not load saved celebrations." }, 503);
      members.push(...(data || []));
      if ((data || []).length < pageSize) {
        return authJSON({ members });
      }
    }
    return authJSON({ message: "Too many member records to load. Contact an administrator." }, 503);
  } catch {
    return authJSON({ message: "Could not load saved celebrations." }, 503);
  }
}
