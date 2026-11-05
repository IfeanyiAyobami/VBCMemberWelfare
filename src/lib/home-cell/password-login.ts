import { saveLoginPreference } from "@/lib/auth/login-preference";
import { withRoute } from "@/lib/home-cell/route";
import { readJson, PayloadError } from "@/lib/reliability/json";
import { authRateLimit } from "@/lib/home-cell/rate-limit";
import { loginIdentity } from "@/lib/home-cell/identity";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { phoneUsernameUser } from "@/lib/home-cell/phone-usernames";
import { actor, adminDb } from "@/lib/home-cell/admin";
import { hasSameOrigin } from "@/lib/auth/http";

export async function passwordPOST(req: NextRequest) {
  if (!hasSameOrigin(req))
    return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  try {
    const limited = await authRateLimit(req, "login");
    if (limited) return limited;
    const body = await readJson(req, 4096);
    const email = body.identifier ?? body.email;
    const password = body.password;
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 1024
    )
      return NextResponse.json(
        { message: "Invalid credentials" },
        { status: 400 },
      );
    const identity = loginIdentity(email);
    if (!identity)
      return NextResponse.json(
        { message: "Enter a valid email or phone number" },
        { status: 400 },
      );
    const accountLimit = await authRateLimit(
      req,
      "login",
      identity.phone || identity.email!,
    );
    if (accountLimit) return accountLimit;
    // Resolve the private phone username, then use ordinary email/password auth.
    // Unknown phones still perform a password attempt and return the same message.
    let loginEmail = identity.email;
    if (identity.phone) {
      const user = await phoneUsernameUser(adminDb(), identity.phone);
      loginEmail = user?.email || "unknown@home-cell.invalid";
    }
    const client = await createClient({ remember: body.remember === true });
    const { data, error } = await client.auth.signInWithPassword({
      email: loginEmail!,
      password,
    });
    if (
      error &&
      (error.status === 429 ||
        (error.status ?? 0) >= 500 ||
        error.name === "AuthRetryableFetchError")
    )
      return NextResponse.json(
        {
          message:
            "Sign-in is temporarily unavailable. Please try again later.",
        },
        { status: error.status === 429 ? 429 : 503 },
      );
    if (error || !data.user)
      return NextResponse.json(
        { message: "Invalid email, phone number or password" },
        { status: 401 },
      );
    try {
      const access = await actor(true);
      if (
        !access.churchAdmin &&
        access.assignments.length &&
        access.assignments.every((x) => x.role === "cell_leader")
      ) {
        await client.auth.signOut({ scope: "local" });
        return NextResponse.json(
          {
            message:
              "Cell leaders sign in with a coordinator-generated four-digit PIN.",
          },
          { status: 403 },
        );
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : "ACCESS_CHECK_FAILED";
      await client.auth.signOut({ scope: "local" });
      return NextResponse.json(
        {
          message:
            code === "HCO_SERVER_NOT_CONFIGURED"
              ? "Add SUPABASE_SERVICE_ROLE_KEY to the server environment and restart."
              : code === "ACCESS_CHECK_FAILED"
                ? "Unable to read leadership permissions. Check the service-role key, Supabase project and migrations."
                : code === "SUSPENDED"
                  ? "Your Home Cell account is suspended. Contact the church administrator."
                  : "No active Home Cell Office access",
        },
        {
          status: ["HCO_SERVER_NOT_CONFIGURED", "ACCESS_CHECK_FAILED"].includes(
            code,
          )
            ? 503
            : 403,
        },
      );
    }
    await saveLoginPreference(body.remember === true);
    return NextResponse.json({
      next:
        data.user.app_metadata?.hco_password_change_required === true
          ? "/home-cell/activate?temporary=1"
          : "/home-cell",
    });
  } catch (error) {
    if (error instanceof PayloadError)
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    return NextResponse.json(
      { message: "Sign-in unavailable" },
      { status: 503 },
    );
  }
}
