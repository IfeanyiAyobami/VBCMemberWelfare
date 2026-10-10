import "server-only";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authJSON } from "../auth/http";
import { careAuthors } from "../members/care-server";
import { memberDatabaseError } from "../members/server";
import { GUEST_LIMITS, type GuestRecord, type Match } from "./model";
import { PREFERENCE_LABELS } from "../members/care-model";
export const GUEST_COLUMNS =
  "id,other_names,surname,visit_date,occupation,gender,age_range,marital_status,phone,whatsapp,email,residential_address,born_again,home_visit,discovery_source,discovery_details,invited_by,contact_consent,birthday_month,birthday_day,anniversary_month,anniversary_day,email_opt_in,sms_opt_in,celebrations_opt_in,programmes_opt_in,newsletters_opt_in,policy_version,source,review_status,member_id,review_notes,reviewed_by,reviewed_at,entered_by,consent_evidence,created_at,updated_at";
export async function guestPayload(request: NextRequest, review = false) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  )
    return {
      ok: false as const,
      response: authJSON({ message: "Send guest details as JSON." }, 400),
    };
  const reader = request.body?.getReader();
  if (!reader)
    return {
      ok: false as const,
      response: authJSON({ message: "Enter the guest details." }, 400),
    };
  try {
    let size = 0,
      text = "";
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        return {
          ok: false as const,
          response: authJSON(
            { message: "This guest request is too large." },
            413,
          ),
        };
      }
      text += decoder.decode(value, { stream: true });
    }
    const data = JSON.parse(text + decoder.decode()),
      keys = review
        ? [
            "action",
            "memberId",
            "targetVersion",
            "expectedVersion",
            "notes",
            "identityConfirmed",
          ]
        : [
            ...Object.keys(GUEST_LIMITS),
            ...Object.keys(PREFERENCE_LABELS),
            "requestId",
            "evidence",
          ];
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).some((k) => !keys.includes(k))
    )
      throw new Error();
    return { ok: true as const, data: data as Record<string, unknown> };
  } catch {
    return {
      ok: false as const,
      response: authJSON(
        { message: "Check the guest request and try again." },
        400,
      ),
    };
  } finally {
    reader.releaseLock();
  }
}
export async function mapGuests(
  supabase: SupabaseClient,
  rows: Record<string, any>[],
): Promise<GuestRecord[]> {
  const authors = await careAuthors(
    supabase,
    rows.flatMap((r) => [r.entered_by, r.reviewed_by]),
  );
  const pair = (m: number | null, d: number | null) =>
    m && d ? String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0") : "";
  return rows.map((r) => ({
    ...Object.fromEntries(
      Object.keys(GUEST_LIMITS).map((k) => [k, r[k] || ""]),
    ),
    ...Object.fromEntries(
      Object.keys(PREFERENCE_LABELS).map((k) => [k, r[k] === true]),
    ),
    birthday: pair(r.birthday_month, r.birthday_day),
    anniversary: pair(r.anniversary_month, r.anniversary_day),
    id: r.id,
    version: r.updated_at,
    source: r.source,
    createdAt: r.created_at,
    status: r.review_status,
    memberId: r.member_id || null,
    reviewNotes: r.review_notes || "",
    reviewedAt: r.reviewed_at || null,
    reviewer:
      authors.get(r.reviewed_by) || (r.reviewed_by ? "Former staff" : ""),
    enteredBy:
      authors.get(r.entered_by) ||
      (r.entered_by
        ? "Former staff"
        : r.source === "manual"
          ? "Staff"
          : "Website"),
    evidence: r.consent_evidence || "",
    policy: r.policy_version,
  })) as GuestRecord[];
}
export async function guestMatches(
  supabase: SupabaseClient,
  row: Record<string, any>,
): Promise<Match[]> {
  const columns = "id,updated_at,other_names,surname,email,phone,archived_at";
  const requests = [
    supabase.from("care_members").select(columns).eq("phone", row.phone),
  ];
  if (row.email)
    requests.push(
      supabase.from("care_members").select(columns).eq("email", row.email),
    );
  const results = await Promise.all(requests);
  const matches = new Map<string, Match>();
  for (const result of results) {
    if (result.error) throw result.error;
    for (const m of result.data || [])
      matches.set(m.id, {
        id: m.id,
        version: m.updated_at,
        first: m.other_names,
        last: m.surname,
        email: m.email || "",
        phone: m.phone || "",
        archivedAt: m.archived_at || null,
        matchEmail: !!row.email && row.email === m.email,
        matchPhone: row.phone === m.phone,
      });
  }
  return [...matches.values()];
}
export function guestError(error: { code?: string }) {
  if (["PGRST202", "PGRST204", "42703", "42883"].includes(error.code || ""))
    return authJSON(
      {
        message:
          "Run the included 005_guest_review.sql in your Member Welfare Supabase project, then reload.",
      },
      503,
    );
  if (error.code === "40001")
    return authJSON(
      {
        message:
          "This guest or member changed after you opened the review. Copy any unsaved notes and reload before deciding.",
      },
      409,
    );
  if (error.code === "23505")
    return authJSON(
      {
        message:
          "A matching contact or submission already exists. Reload the review and inspect the matching records before proceeding.",
      },
      409,
    );
  if (error.code === "P0002")
    return authJSON(
      {
        message:
          "Guest or active matching member not found. Archived members must be restored before linking.",
      },
      404,
    );
  return memberDatabaseError(error);
}
