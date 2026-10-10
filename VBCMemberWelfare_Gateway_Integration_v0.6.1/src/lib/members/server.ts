import "server-only";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/staff";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import type { MemberRecord } from "./model";

export const MEMBER_COLUMNS =
  "id,other_names,surname,email,phone,status,occupation,residential_address,joined_on,birthday_month,birthday_day,anniversary_month,anniversary_day,updated_at,created_by,archived_at,care_preferences(contact_consent,email_opt_in,sms_opt_in,celebrations_opt_in,programmes_opt_in,newsletters_opt_in,updated_at,evidence_note,policy_version)";

export async function memberAccess(request: NextRequest, write = false) {
  if (write && !hasSameOrigin(request))
    return {
      ok: false as const,
      response: authJSON(
        { message: "This request must come from the dashboard." },
        403,
      ),
    };
  try {
    const supabase = await createClient();
    const session = await getStaffSession(supabase);
    if (session.status !== "ready") {
      const status =
        session.status === "unauthenticated"
          ? 401
          : session.status === "forbidden"
            ? 403
            : 503;
      return {
        ok: false as const,
        response: authJSON(
          {
            message:
              status === 503
                ? "We cannot verify access right now. Please try again."
                : "Active staff access is required.",
          },
          status,
        ),
      };
    }
    if (session.staff.role === "followup_worker")
      return { ok: false as const, response: authJSON({ message: "Follow-up workers can only access assigned follow-ups." }, 403) };
    if (write && session.staff.role === "viewer")
      return {
        ok: false as const,
        response: authJSON(
          {
            message:
              "Your role allows viewing members. Ask an editor or administrator to save changes.",
          },
          403,
        ),
      };
    return { ok: true as const, supabase, staff: session.staff };
  } catch {
    return {
      ok: false as const,
      response: authJSON(
        { message: "We cannot verify access right now. Please try again." },
        503,
      ),
    };
  }
}

export async function memberPayload(
  request: NextRequest,
  mode: "create" | "update" | "preferences" | "note" | "archive",
) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  )
    return {
      ok: false as const,
      response: authJSON({ message: "Send the member details as JSON." }, 400),
    };
  const reader = request.body?.getReader();
  if (!reader)
    return {
      ok: false as const,
      response: authJSON({ message: "Enter the member details." }, 400),
    };
  try {
    let size = 0,
      text = "";
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > (mode === "note" ? 32768 : 8192)) {
        await reader.cancel();
        return {
          ok: false as const,
          response: authJSON(
            { message: "The member details are too large." },
            413,
          ),
        };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const data = JSON.parse(text);
    const fields =
      mode === "preferences"
        ? ["preferences", "evidence", "expectedVersion"]
        : mode === "note"
          ? ["body", "requestId"]
          : mode === "archive"
            ? ["archived", "expectedVersion"]
            : [
                "first",
                "last",
                "email",
                "phone",
                "status",
                "occupation",
                "address",
                "birthday",
                "anniversary",
                "joined",
                mode === "create" ? "requestId" : "expectedVersion",
              ];
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).some((k) => !fields.includes(k))
    )
      throw new Error();
    return { ok: true as const, data: data as Record<string, unknown> };
  } catch {
    return {
      ok: false as const,
      response: authJSON(
        { message: "Check the member details and try again." },
        400,
      ),
    };
  } finally {
    reader.releaseLock();
  }
}

export function mapMember(row: Record<string, any>): MemberRecord {
  const milestone = (month: number | null, day: number | null) =>
    month && day
      ? String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0")
      : "";
  const preferences = Array.isArray(row.care_preferences)
    ? row.care_preferences[0]
    : row.care_preferences;
  return {
    id: row.id,
    version: row.updated_at,
    archivedAt: row.archived_at || null,
    preferenceVersion: preferences?.updated_at || null,
    preferenceEvidence: preferences?.evidence_note || "",
    preferencePolicy: preferences?.policy_version || "v1",
    first: row.other_names,
    last: row.surname,
    email: row.email || "",
    phone: row.phone || "",
    status: row.status,
    occupation: row.occupation || "",
    address: row.residential_address || "",
    joined: row.joined_on,
    birthday: milestone(row.birthday_month, row.birthday_day),
    anniversary: milestone(row.anniversary_month, row.anniversary_day),
    preferences: {
      contact_consent: preferences?.contact_consent === true,
      email_opt_in: preferences?.email_opt_in === true,
      sms_opt_in: preferences?.sms_opt_in === true,
      celebrations_opt_in: preferences?.celebrations_opt_in === true,
      programmes_opt_in: preferences?.programmes_opt_in === true,
      newsletters_opt_in: preferences?.newsletters_opt_in === true,
    },
  };
}
export function memberDatabaseError(error: { code?: string }) {
  if (error.code === "P0002")
    return authJSON({ message: "Member not found or archived." }, 404);
  if (error.code === "40001")
    return authJSON(
      {
        message:
          "This record changed since you opened it. Copy any unsaved changes, close this form and reload the profile before trying again.",
      },
      409,
    );
  if (error.code === "PGRST202" || error.code === "42883")
    return authJSON(
      {
        message:
          "Run the included 004_care_controls.sql in your Member Welfare Supabase project, then try again.",
      },
      503,
    );
  if (error.code === "23505")
    return authJSON(
      {
        message:
          "This email or phone is already recorded, including archived members. Open the existing record instead.",
      },
      409,
    );
  if (error.code === "42501")
    return authJSON(
      { message: "Your current staff permissions do not allow this action." },
      403,
    );
  if (["23514", "22023", "22007", "22008", "22P02"].includes(error.code || ""))
    return authJSON(
      {
        message:
          "The database rejected these details. Check the dates and contact information.",
      },
      400,
    );
  return authJSON(
    { message: "We could not complete the member request. Please try again." },
    503,
  );
}
