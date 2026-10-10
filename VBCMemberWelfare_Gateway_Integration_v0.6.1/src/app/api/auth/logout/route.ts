import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/auth/config";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request))
    return authJSON(
      { message: "This request must come from the dashboard." },
      403,
    );
  const config = getSupabaseConfig();
  if (!config.ready) return authJSON({ message: config.message }, 503);
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error)
      return authJSON(
        { message: "We could not complete sign-out. Please try again." },
        503,
      );
    return authJSON({ next: "/access" });
  } catch {
    return authJSON(
      { message: "We could not complete sign-out. Please try again." },
      503,
    );
  }
}
