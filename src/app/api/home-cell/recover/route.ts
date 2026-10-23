import { withRoute } from "@/lib/home-cell/route";
import { readJson, PayloadError } from "@/lib/reliability/json";
import { authRateLimit } from "@/lib/home-cell/rate-limit";
import { NextRequest } from "next/server";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { createClient } from "@/lib/supabase/server";
async function handlePOST(req: NextRequest) {
  if (!hasSameOrigin(req)) return authJSON({ message: "Invalid origin" }, 403);
  try {
    const limited = await authRateLimit(req, "recover");
    if (limited) return limited;
    const b = await readJson(req, 4096);
    if (
      typeof b.email !== "string" ||
      b.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)
    )
      return authJSON({ message: "Enter a valid email address." }, 400);
    const accountLimit = await authRateLimit(req, "recover", b.email);
    if (accountLimit) return accountLimit;
    const c = await createClient();
    if (!b.email.trim().toLowerCase().endsWith("@home-cell.invalid")) {
      const { error } = await c.auth.resetPasswordForEmail(b.email.trim(), {
        redirectTo: req.nextUrl.origin + "/home-cell/activate",
      });
      if (error) return authJSON({ message: 'Password recovery is temporarily unavailable. Please try again later.' }, error.status === 429 ? 429 : 503);
    }
    return authJSON({
      message:
        "If an account exists, a password reset email will be sent. Check your inbox and spam folder.",
    });
  } catch (error) {
    if (error instanceof PayloadError) return authJSON({ message: error.message }, error.status);
    return authJSON(
      { message: "Password recovery is unavailable. Please try again later." },
      503,
    );
  }
}

export const POST = withRoute("recover", "POST", handlePOST);
