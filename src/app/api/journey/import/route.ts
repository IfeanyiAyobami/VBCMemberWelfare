import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/staff";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { readJson, PayloadError } from "@/lib/reliability/json";
import { uuid } from "@/lib/journey/model";
import { intakeError, type Intake } from "@/lib/journey/intake";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request))
    return authJSON({ message: "Invalid origin." }, 403);
  try {
    const client = await createClient();
    const session = await getStaffSession(client);
    if (session.status !== "ready")
      return authJSON({ message: "Active staff access required." }, 403);
    const permission = await client.rpc("care_journey_can_register");
    if (permission.error)
      return authJSON(
        { message: "Registration service unavailable. Check migration 022." },
        503,
      );
    if (permission.data !== true)
      return authJSON(
        { message: "Friend or Coordinator registration access is required." },
        403,
      );
    const body = await readJson(request, 131072);
    if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 10)
      return authJSON({ message: "Send 1–10 reviewed rows at a time." }, 400);
    const results = [];
    for (const row of body.rows) {
      if (
        !row ||
        typeof row.requestId !== "string" ||
        !uuid.test(row.requestId) ||
        !row.data ||
        typeof row.data !== "object" ||
        Array.isArray(row.data)
      )
        return authJSON({ message: "Invalid import row." }, 400);
      // Imports only create new records. Never accept a caller-supplied existing ID or assignment.
      const allowed = [
        "birthdayMonth",
        "birthdayDay",
        "anniversaryMonth",
        "anniversaryDay",
        "first",
        "last",
        "phone",
        "email",
        "gender",
        "occupation",
        "address",
        "contactConsent",
        "emailOptIn",
        "smsOptIn",
        "previousVisitDate",
        "visitEvidence",
        "note",
      ];
      if (
        Object.keys(row.data).some((k) => !allowed.includes(k)) ||
        Object.values(row.data).some(
          (v) => !["string", "boolean"].includes(typeof v),
        )
      )
        return authJSON({ message: "Invalid import fields." }, 400);
      const error = intakeError(row.data as Intake);
      if (error) {
        results.push({
          requestId: row.requestId,
          saved: false,
          message: error,
        });
        continue;
      }
      const r = await client.rpc("care_journey_direct", {
        p_data: row.data,
        p_request: row.requestId,
      });
      results.push({
        requestId: row.requestId,
        saved: !r.error,
        memberId: r.data?.memberId,
        message: r.error
          ? r.error.code === "23505"
            ? "An existing record matches this phone or email. Ask the Coordinator to review the identity."
            : r.error.code === "42501"
              ? "Registration access is required."
              : r.error.code?.startsWith("22")
                ? r.error.message
                : "Unable to confirm this row. Retry with the same import to check it safely."
          : "Saved",
      });
    }
    return authJSON({ results });
  } catch (e) {
    return authJSON(
      {
        message:
          e instanceof PayloadError
            ? e.message
            : "Could not confirm the import. Keep this preview and retry safely.",
      },
      e instanceof PayloadError ? e.status : 503,
    );
  }
}
