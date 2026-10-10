import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/auth/config";
import { getStaffSession } from "@/lib/auth/staff";
import { authJSON, hasSameOrigin, safeNextPath } from "@/lib/auth/http";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request))
    return authJSON(
      { message: "This request must come from the dashboard." },
      403,
    );
  const config = getSupabaseConfig();
  if (!config.ready) return authJSON({ message: config.message }, 503);
  let payload: { email?: unknown; password?: unknown; next?: unknown };
  try {
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new Error();
    const text = await request.text();
    if (text.length > 4096) throw new Error();
    payload = JSON.parse(text);
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Error();
  } catch {
    return authJSON({ message: "Enter your email and password." }, 400);
  }
  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    password.length > 1024
  )
    return authJSON({ message: "Enter a valid email and your password." }, 400);
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      const unavailable =
        error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500;
      return authJSON(
        {
          message: unavailable
            ? "We cannot reach sign-in right now. Please try again."
            : error.status === 429
              ? "Too many sign-in attempts. Please wait before trying again."
              : "We could not sign you in. Check your email and password.",
        },
        unavailable ? 503 : error.status === 429 ? 429 : 401,
      );
    }
    const session = await getStaffSession(supabase);
    if (session.status !== "ready") {
      await supabase.auth.signOut({ scope: "local" });
      return authJSON(
        {
          message:
            session.status === "unavailable"
              ? "We could not verify staff access. Please try again."
              : "This account does not have active staff access. Contact your church administrator.",
        },
        session.status === "unavailable" ? 503 : 403,
      );
    }
    return authJSON({ next: safeNextPath(payload.next) });
  } catch {
    return authJSON(
      { message: "We cannot reach sign-in right now. Please try again." },
      503,
    );
  }
}
