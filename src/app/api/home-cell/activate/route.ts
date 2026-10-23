import { withRoute } from "@/lib/home-cell/route";
import {createHash} from "node:crypto";
import { NextRequest } from "next/server";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { createClient } from "@/lib/supabase/server";
import { actor } from "@/lib/home-cell/admin";
async function handlePOST(req: NextRequest) {
  if (!hasSameOrigin(req)) return authJSON({ message: "Invalid origin" }, 403);
  try {
    const raw = await req.text();
    if (raw.length > 16384)
      return authJSON({ message: "Invalid request" }, 400);
    const b = JSON.parse(raw);
    const client = await createClient();
    if (b.code) {
      const { error } = await client.auth.exchangeCodeForSession(b.code);
      return error
        ? authJSON(
            { message: "Recovery link expired. Request a new email." },
            400,
          )
        : authJSON({ ok: true });
    }
    if (b.access_token && b.refresh_token) {
      const { error } = await client.auth.setSession({
        access_token: b.access_token,
        refresh_token: b.refresh_token,
      });
      if (error)
        return authJSON(
          {
            message: "This invitation or recovery link is invalid or expired.",
          },
          400,
        );
      return authJSON({ ok: true });
    }
    const a = await actor(true);
    if (b.check) return authJSON({ok: true});
    if (
      typeof b.password !== "string" ||
      b.password.length < 12 ||
      b.password.length > 1024
    )
      return authJSON(
        { message: "Choose a password of at least 12 characters." },
        400,
      );
    if (a.user.app_metadata?.hco_temporary_password_hash === createHash("sha256").update(b.password).digest("hex"))
      return authJSON({message: "Choose a different password from your temporary password."}, 400);
    const { error } = await client.auth.updateUser({ password: b.password });
    if (error)
      return authJSON(
        {
          message: "Unable to update password. Request a fresh recovery link.",
        },
        400,
      );
    if (a.user.app_metadata?.hco_password_change_required === true) {
      const {error: clearError} = await a.db.auth.admin.updateUserById(a.user.id, {
        app_metadata: {...a.user.app_metadata, hco_password_change_required: false, hco_temporary_password_hash: null},
      });
      if (clearError) return authJSON({message: "Password saved, but activation could not finish. Try again or contact your administrator."}, 503);
    }
    return authJSON({ ok: true, next: "/home-cell" });
  } catch {
    return authJSON(
      {
        message:
          "Unable to activate this account. Contact the church administrator.",
      },
      403,
    );
  }
}

export const POST = withRoute("activate", "POST", handlePOST);
