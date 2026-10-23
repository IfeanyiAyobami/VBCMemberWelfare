import { NextRequest } from "next/server";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { actor } from "@/lib/home-cell/admin";
import { withRoute } from "@/lib/home-cell/route";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { isMemberId } from "@/lib/members/model";
import { publicLoginEmail } from "@/lib/home-cell/phone-usernames";
async function handlePOST(req: NextRequest) {
  if (!hasSameOrigin(req)) return authJSON({ message: "Invalid origin" }, 403);
  let operation: {
    actor: string;
    request: string;
    db: Awaited<ReturnType<typeof actor>>["db"];
  } | null = null;
  try {
    const a = await actor();
    if (!a.churchAdmin)
      return authJSON(
        { message: "Only a church administrator can replace login passwords." },
        403,
      );
    const b = await req.json();
    if (
      !isMemberId(b.assignment_id) ||
      !isMemberId(b.request_id) ||
      typeof b.reason !== "string" ||
      b.reason.trim().length < 5 ||
      b.reason.length > 2000 ||
      b.confirm_shared_password !== true
    )
      return authJSON(
        {
          message:
            "Select a leader, enter a reason and confirm the shared dashboard password change.",
        },
        400,
      );
    // Service-only counter; never store the administrator ID in the rate table.
    const bucket = createHmac(
      "sha256",
      process.env.HCO_RATE_LIMIT_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
      .update("password-reset:" + a.user.id)
      .digest("hex");
    const rate = await a.db.rpc("hco_rate_limit", {
      p_bucket: bucket,
      p_limit: 10,
      p_window: 300,
    });
    if (rate.error || !rate.data)
      return authJSON(
        { message: "Password protection is unavailable. Check migration 015." },
        503,
      );
    if (!rate.data.allowed) {
      const r = authJSON(
        { message: "Too many password requests. Try again in five minutes." },
        429,
      );
      r.headers.set("Retry-After", "300");
      return r;
    }
    const started = await a.db.rpc("hco_password_begin", {
      p_actor: a.user.id,
      p_assignment: b.assignment_id,
      p_request: b.request_id,
      p_reason: b.reason.trim(),
    });
    if (started.error) {
      const message = started.error.message || "";
      return authJSON(
        {
          message: ["PGRST202", "42883"].includes(started.error.code)
            ? "Apply migration 016 before generating replacement passwords."
            : message.includes("IN_PROGRESS")
              ? "A password replacement was recently requested. Wait 90 seconds before generating another."
              : message.includes("ALREADY_REQUESTED")
                ? "This request was already processed. Check the saved login details; if lost, wait 90 seconds and start a new replacement."
                : message.includes("TARGET_SUSPENDED")
                  ? "Reactivate the account before replacing its password."
                  : "Password replacement is not permitted. Refresh and select another active leader.",
        },
        409,
      );
    }
    operation = { actor: a.user.id, request: b.request_id, db: a.db };
    const target = started.data?.user_id;
    const result = await a.db.auth.admin.getUserById(target);
    if (result.error || !result.data.user) throw Error("ACCOUNT_UNAVAILABLE");
    const user = result.data.user;
    if (!user.email) throw Error("PHONE_REPAIR_REQUIRED");
    const temporary = "Vbc!" + randomBytes(18).toString("base64url") + "7a";
    const updated = await a.db.auth.admin.updateUserById(target, {
      password: temporary,
      app_metadata: {
        ...user.app_metadata,
        hco_password_change_required: true,
        hco_temporary_password_hash: createHash("sha256")
          .update(temporary)
          .digest("hex"),
      },
    });
    if (updated.error) throw Error("PASSWORD_UPDATE_UNCERTAIN");
    const finished = await a.db.rpc("hco_password_finish", {
      p_actor: a.user.id,
      p_request: b.request_id,
      p_completed: true,
    });
    return authJSON({
      ok: true,
      login:
        publicLoginEmail(user.email) ||
        user.app_metadata?.hco_phone_username ||
        user.phone,
      temporary_password: temporary,
      audit_pending: !!finished.error,
      message: finished.error
        ? "Password replaced. Copy it now. The completion audit needs administrator review."
        : "Replacement password created. The leader must choose a new password at sign-in.",
    });
  } catch (error) {
    if (operation) {
      try {
        await operation.db.rpc("hco_password_finish", {
          p_actor: operation.actor,
          p_request: operation.request,
          p_completed: false,
        });
      } catch {
        /* Persisted request remains pending for reconciliation. */
      }
    }
    return authJSON(
      {
        message: operation
          ? error instanceof Error && error.message === "PHONE_REPAIR_REQUIRED"
            ? "Repair this legacy phone login first, then wait 90 seconds before retrying."
            : "We could not confirm the password replacement. It may have changed. Wait 90 seconds, then generate a fresh replacement. Do not reuse the old password."
          : "Password replacement is unavailable or your access has changed.",
      },
      503,
    );
  }
}
export const POST = withRoute("leaders/password", "POST", handlePOST);
