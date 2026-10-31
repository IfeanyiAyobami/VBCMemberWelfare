import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/staff";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { readJson, PayloadError } from "@/lib/reliability/json";
import { uuid } from "@/lib/journey/model";
import { apiConfig } from "@/lib/whatsapp/core";
import { dispatchInvitation } from "@/lib/whatsapp/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function failure(e: { code?: string; message?: string }) {
  return authJSON(
    {
      message:
        e.code === "23505"
          ? "An API invitation already exists for this person and campaign. Refresh its status; do not resend."
          : e.code === "42501" || e.code?.startsWith("22")
            ? e.message
            : e.code?.startsWith("23")
              ? "Check the required fields, template name and language code."
              : "WhatsApp storage is unavailable. Check migration 020.",
    },
    e.code === "42501"
      ? 403
      : e.code === "23505"
        ? 409
        : e.code?.startsWith("22") || e.code?.startsWith("23")
          ? 400
          : 503,
  );
}
export async function GET(req: NextRequest) {
  try {
    const client = await createClient(),
      session = await getStaffSession(client);
    if (session.status !== "ready")
      return authJSON({ message: "Active staff access required." }, 403);
    const member = req.nextUrl.searchParams.get("memberId");
    if (!member || !uuid.test(member))
      return authJSON({ message: "Select a person." }, 400);
    const { data, error } = await client.rpc("care_wa_read", {
      p_member: member,
    });
    return error
      ? failure(error)
      : authJSON({ ...data, apiReady: apiConfig().ready });
  } catch {
    return authJSON({ message: "Unable to load WhatsApp invitations." }, 503);
  }
}
export async function POST(req: NextRequest) {
  if (!hasSameOrigin(req)) return authJSON({ message: "Invalid origin." }, 403);
  try {
    const b = await readJson(req, 12000),
      client = await createClient(),
      session = await getStaffSession(client);
    if (session.status !== "ready")
      return authJSON({ message: "Active staff access required." }, 403);
    const valid = (x: unknown) => typeof x === "string" && uuid.test(x);
    let result;
    if (
      b.action === "campaign" &&
      typeof b.title === "string" &&
      typeof b.body === "string" &&
      b.title.length <= 100 &&
      b.body.length <= 2000 &&
      (!b.template || typeof b.template === "string") &&
      typeof b.language === "string"
    )
      result = await client.rpc("care_wa_campaign", {
        p_title: b.title,
        p_body: b.body,
        p_template: b.template || null,
        p_language: b.language,
      });
    else if (
      b.action === "permission" &&
      valid(b.memberId) &&
      typeof b.allowed === "boolean" &&
      typeof b.evidence === "string" &&
      b.evidence.length <= 1000
    )
      result = await client.rpc("care_wa_permission", {
        p_member: b.memberId,
        p_allowed: b.allowed,
        p_evidence: b.evidence,
      });
    else if (
      b.action === "prepare" &&
      valid(b.memberId) &&
      valid(b.campaignId) &&
      valid(b.requestId) &&
      ["assisted", "api"].includes(String(b.mode)) &&
      typeof b.body === "string" &&
      b.body.length <= 2500
    ) {
      if (b.mode === "api" && (!apiConfig().ready || b.confirmPaid !== true))
        return authJSON(
          {
            message: !apiConfig().ready
              ? "WhatsApp API is not configured. Use staff-assisted sending."
              : "Confirm the paid API send.",
          },
          400,
        );
      result = await client.rpc("care_wa_prepare", {
        p_member: b.memberId,
        p_campaign: b.campaignId,
        p_mode: b.mode,
        p_body: b.body,
        p_request: b.requestId,
      });
      if (!result.error && b.mode === "api")
        await dispatchInvitation(String(b.requestId));
    } else if (
      b.action === "record" &&
      valid(b.messageId) &&
      ["sent", "replied", "unsent"].includes(String(b.outcome)) &&
      typeof b.note === "string" &&
      b.note.length <= 2000 &&
      (!b.next || typeof b.next === "string")
    )
      result = await client.rpc("care_wa_record", {
        p_message: b.messageId,
        p_outcome: b.outcome,
        p_note: b.note,
        p_next: b.next || null,
      });
    else return authJSON({ message: "Check the invitation details." }, 400);
    return result.error
      ? failure(result.error)
      : authJSON({ saved: true, result: result.data });
  } catch (e) {
    return authJSON(
      {
        message:
          e instanceof PayloadError
            ? e.message
            : "Unable to complete this request. Refresh the invitation status before trying again; an API send may already have been accepted.",
      },
      e instanceof PayloadError ? e.status : 503,
    );
  }
}
