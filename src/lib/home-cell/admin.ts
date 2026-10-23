import { boundedFetch } from "@/lib/reliability/fetch";
import "server-only";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
export type HcoRole =
  "church_admin" | "coordinator" | "area_leader" | "cell_leader";
export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("HCO_SERVER_NOT_CONFIGURED");
  return createAdminClient(url, key, {
    global: { fetch: boundedFetch },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
export async function actor(allowPasswordChange = false) {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  const db = adminDb();
  const [staffResult, assignmentResult, accessResult] = await Promise.all([
    db
      .from("care_staff")
      .select("role,is_active")
      .eq("user_id", user.id)
      .maybeSingle(),
    db
      .from("hco_assignments")
      .select("id,role,area_id,cell_id")
      .eq("user_id", user.id)
      .eq("active", true),
    db
      .from("hco_access")
      .select("suspended_at,session_revoked_after")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (staffResult.error || assignmentResult.error || accessResult.error)
    throw new Error("ACCESS_CHECK_FAILED");
  const staff = staffResult.data,
    assignments = assignmentResult.data,
    access = accessResult.data;
  if (access?.suspended_at) throw new Error("SUSPENDED");
  if (access?.session_revoked_after) {
    const {
      data: { session },
    } = await client.auth.getSession();
    let sessionId: string | undefined;
    try {
      sessionId = JSON.parse(
        Buffer.from(
          session!.access_token.split(".")[1],
          "base64url",
        ).toString(),
      ).session_id;
    } catch {
      throw Error("UNAUTHENTICATED");
    }
    const { data: allowed, error } = await db.rpc("hco_session_allowed", {
      p_user: user.id,
      p_session: sessionId,
    });
    if (error || !allowed) throw Error("UNAUTHENTICATED");
  }
  const roles = assignments ?? [];
  const churchAdmin =
    (staff?.is_active === true && staff.role === "administrator") ||
    roles.some((x) => x.role === "church_admin");
  if (!churchAdmin && !roles.length) throw new Error("FORBIDDEN");
  const areas = roles
    .filter((x) => x.role === "coordinator" && x.area_id)
    .map((x) => x.area_id as string);
  if (!allowPasswordChange && user.app_metadata?.hco_password_change_required === true) throw Error("PASSWORD_CHANGE_REQUIRED");
  return { user, db, churchAdmin, areas, assignments: roles };
}
export async function canManage(targetArea: string | null, role: string) {
  const a = await actor();
  if (a.churchAdmin) return a;
  if (
    !a.areas.length ||
    !targetArea ||
    !a.areas.includes(targetArea) ||
    !["area_leader", "cell_leader"].includes(role)
  )
    throw new Error("FORBIDDEN");
  return a;
}
export async function audit(
  actorId: string,
  targetId: string | null,
  action: string,
  details: Record<string, unknown>,
) {
  const { error } = await adminDb()
    .from("hco_audit")
    .insert({ actor_id: actorId, target_user_id: targetId, action, details });
  if (error) throw new Error("AUDIT_FAILED");
}
