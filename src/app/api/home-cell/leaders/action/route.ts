import { withRoute } from "@/lib/home-cell/route";
import { NextRequest } from "next/server";
import { actor } from "@/lib/home-cell/admin";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
async function handlePOST(req: NextRequest) {
  if (!hasSameOrigin(req)) return authJSON({ message: "Invalid origin" }, 403);
  try {
    const a = await actor();
    if (!a.churchAdmin && !a.areas.length)
      return authJSON({ message: "Forbidden" }, 403);
    const raw = await req.text();
    if (raw.length > 8192)
      return authJSON({ message: "Request too large" }, 413);
    const b = JSON.parse(raw);
    if (b.action === "add_role" && b.user_id && !b.assignment_id) {
      const { data, error } = await a.db.auth.admin.getUserById(b.user_id);
      if (
        error ||
        !data.user ||
        typeof b.email !== "string" ||
        data.user.email?.toLowerCase() !== b.email.trim().toLowerCase()
      )
        return authJSON(
          {
            message:
              "User ID and email do not match. Verify the existing account before assigning a role.",
          },
          400,
        );
    }
    const { data, error } = await a.db.rpc("hco_leadership_write", {
      p_actor: a.user.id,
      p_action: b.action,
      p_data: b,
    });
    if (error)
      return authJSON(
        {
          message: ["PGRST202", "42883"].includes(error.code)
            ? "Apply migration 011 before managing leadership."
            : error.message.includes("HCO_")
              ? error.message
              : "Leadership change failed. Refresh and check the assignment.",
        },
        409,
      );
    return authJSON({ ok: true, result: data });
  } catch {
    return authJSON({ message: "Leadership access denied" }, 403);
  }
}

export const POST = withRoute("leaders/action", "POST", handlePOST);
