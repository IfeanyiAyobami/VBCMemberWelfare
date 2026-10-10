import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "./config";
import type { StaffSession, StaffRole } from "./types";

export async function getStaffSession(
  client?: SupabaseClient,
): Promise<StaffSession> {
  const config = getSupabaseConfig();
  if (!config.ready)
    return { status: "configuration", message: config.message };
  try {
    const supabase = client ?? (await createClient());
    // Auth validates the cookie token remotely. A decoded cookie alone never grants access.
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      if (
        userError &&
        (userError.name === "AuthRetryableFetchError" ||
          (userError.status ?? 0) >= 500)
      )
        return { status: "unavailable" };
      return { status: "unauthenticated" };
    }
    // Use the signed-in user's publishable-key client; Supabase RLS still applies.
    const { data, error } = await supabase
      .from("care_staff")
      .select("user_id,display_name,role,is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (error) return { status: "unavailable" };
    if (
      !data ||
      data.is_active !== true ||
      !["administrator", "editor", "viewer"].includes(data.role)
    )
      return { status: "forbidden" };
    return {
      status: "ready",
      staff: {
        user_id: user.id,
        display_name: data.display_name || "VBC staff",
        role: data.role as StaffRole,
        email: user.email ?? "",
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}
