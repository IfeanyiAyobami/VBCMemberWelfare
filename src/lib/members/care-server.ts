import "server-only";
import { authJSON } from "@/lib/auth/http";
import type { SupabaseClient } from "@supabase/supabase-js";
import { memberDatabaseError } from "./server";

export async function careMember(
  supabase: SupabaseClient,
  id: string,
  activeOnly = false,
) {
  let query = supabase
    .from("care_members")
    .select("id,archived_at")
    .eq("id", id);
  if (activeOnly) query = query.is("archived_at", null);
  const { data, error } = await query.maybeSingle();
  if (error)
    return { ok: false as const, response: memberDatabaseError(error) };
  if (!data)
    return {
      ok: false as const,
      response: authJSON({ message: "Member not found or archived." }, 404),
    };
  return { ok: true as const, data };
}
export function carePageParam(raw: string | null) {
  const v = raw ?? "1";
  return /^\d{1,6}$/.test(v) && Number(v) >= 1 && Number(v) <= 100000
    ? Number(v)
    : null;
}
export async function careAuthors(supabase: SupabaseClient, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const { data, error } = await supabase
    .from("care_staff")
    .select("user_id,display_name")
    .in("user_id", unique);
  if (error) throw error;
  return new Map<string, string>(
    (data || []).map((row) => [row.user_id, row.display_name]),
  );
}
