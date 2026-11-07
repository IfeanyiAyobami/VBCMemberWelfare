import { passwordPOST } from "@/lib/home-cell/password-login";
import { withRoute } from "@/lib/home-cell/route";
import { saveLoginPreference } from "@/lib/auth/login-preference";
import { NextRequest } from "next/server";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { readJson, PayloadError } from "@/lib/reliability/json";
import { adminDb } from "@/lib/home-cell/admin";
import { authRateLimit } from "@/lib/home-cell/rate-limit";
import { loginIdentity } from "@/lib/home-cell/identity";
import { createClient } from "@/lib/supabase/server";
import { checkPin, validPin } from "@/lib/home-cell/pin";
export const dynamic = "force-dynamic";
async function handlePOST(req: NextRequest) {
  if (!hasSameOrigin(req)) return authJSON({ message: "Invalid origin." }, 403);
  try {
    // Read the body once. Reading a clone and abandoning the original left
    // oversized requests hanging instead of answering 413 (fixed in v4.12).
    const b = await readJson(req, 4096);
    if (b.mode === "staff")
      return passwordPOST(
        new NextRequest(req.url, {
          method: "POST",
          headers: req.headers,
          body: JSON.stringify(b),
        }),
      );
    const limit = await authRateLimit(req, "login");
    if (limit) return limit;
    const identity =
      typeof b.identifier === "string" && b.identifier.length <= 254
        ? loginIdentity(b.identifier)
        : null;
    if (!identity || !validPin(b.pin))
      return authJSON(
        {
          message:
            "Enter an email or phone number and exactly four PIN digits.",
        },
        400,
      );
    const secret = process.env.HOME_CELL_PIN_SECRET;
    if (!secret || secret.length < 32)
      return authJSON(
        { message: "Home Cell leader sign-in is not configured." },
        503,
      );
    const db = adminDb();
    const a = await db.rpc("hco_leader_pin_attempt", {
      p_identity: identity.email || identity.phone,
    });
    if (a.error) throw Error("PROTECTION_UNAVAILABLE");
    const r = a.data;
    const accepted = await checkPin(
      b.pin,
      r?.pin_hash || "0".repeat(32) + ":" + "0".repeat(128),
      secret,
    );
    if (!accepted || !r?.user_id)
      return authJSON(
        {
          message:
            "Unable to sign in. Check your details or ask the administrator to reset your PIN if attempts are locked.",
        },
        401,
      );
    const allowed = await db.rpc("hco_leader_pin_complete", {
      p_user: r.user_id,
      p_version: r.version,
    });
    if (allowed.error || allowed.data !== true)
      return authJSON(
        {
          message:
            "Unable to sign in. Ask the administrator to check your Home Cell leader access.",
        },
        401,
      );
    const user = await db.auth.admin.getUserById(r.user_id);
    if (user.error || !user.data.user?.email)
      throw Error("ACCOUNT_UNAVAILABLE");
    // Generate a server-only one-time token after successful PIN verification. No email is sent.
    const link = await db.auth.admin.generateLink({
      type: "magiclink",
      email: user.data.user.email,
    });
    if (link.error || !link.data.properties?.hashed_token)
      throw Error("SESSION_UNAVAILABLE");
    const client = await createClient({ remember: b.remember === true });
    const signed = await client.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.data.properties.hashed_token,
    });
    if (signed.error || signed.data.user?.id !== r.user_id) {
      await client.auth.signOut({ scope: "local" });
      throw Error("SESSION_UNAVAILABLE");
    }
    await saveLoginPreference(b.remember === true);
    return authJSON({ next: "/home-cell" });
  } catch (e) {
    return authJSON(
      {
        message:
          e instanceof PayloadError
            ? e.message
            : "Home Cell leader sign-in is temporarily unavailable.",
      },
      e instanceof PayloadError ? e.status : 503,
    );
  }
}

export const POST = withRoute("login", "POST", handlePOST);
