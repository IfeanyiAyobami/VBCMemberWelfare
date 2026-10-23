import { boundedFetch } from "@/lib/reliability/fetch";
import "server-only";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authJSON } from "@/lib/auth/http";
import { validBridgeSignature, WORDPRESS_EVIDENCE } from "@/lib/guests/bridge";
import { GUEST_LIMITS, validateGuest, guestColumns } from "@/lib/guests/model";
import { PREFERENCE_LABELS } from "@/lib/members/care-model";
import { isMemberId } from "@/lib/members/model";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const enabled = process.env.VBC_GUEST_BRIDGE_ENABLED === "true",
    secret = process.env.VBC_WORDPRESS_BRIDGE_SECRET || "",
    key = process.env.SUPABASE_SECRET_KEY || "",
    url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!enabled || !key || !url || !/^[a-f0-9]{64,128}$/i.test(secret))
    return authJSON(
      { success: false, message: "Guest intake is not enabled." },
      503,
    );
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  )
    return authJSON({ success: false, message: "Send JSON." }, 400);
  const reader = request.body?.getReader();
  if (!reader)
    return authJSON({ success: false, message: "Missing guest card." }, 400);
  let raw = "",
    size = 0;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        return authJSON(
          { success: false, message: "Guest card too large." },
          413,
        );
      }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
  } catch {
    return authJSON({ success: false, message: "Invalid guest card." }, 400);
  } finally {
    reader.releaseLock();
  }
  if (
    !validBridgeSignature(
      raw,
      request.headers.get("x-vbc-timestamp"),
      request.headers.get("x-vbc-signature"),
      secret,
    )
  )
    return authJSON(
      { success: false, message: "Invalid receiver signature." },
      401,
    );
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return authJSON({ success: false, message: "Invalid guest card." }, 400);
  }
  const allowed = [
    "requestId",
    ...Object.keys(GUEST_LIMITS),
    ...Object.keys(PREFERENCE_LABELS),
  ];
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).some((k) => !allowed.includes(k)) ||
    !isMemberId(payload.requestId)
  )
    return authJSON(
      { success: false, message: "Invalid guest card fields." },
      400,
    );
  const valid = validateGuest(payload);
  if (!valid.ok)
    return authJSON(
      {
        success: false,
        message: "Check the guest card details.",
        errors: valid.errors,
      },
      400,
    );
  try {
    // Dedicated server client: no staff session and no cookie mixing.
    const supabase = createClient(url, key, {
      global: { fetch: boundedFetch },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await supabase.rpc("care_record_guest", {
      p_submission_key: payload.requestId,
      p_guest: guestColumns(valid.value),
      p_evidence: WORDPRESS_EVIDENCE,
    });
    if (error || !data) {
      const code = error?.code;
      return authJSON(
        {
          success: false,
          message:
            code === "23505"
              ? "This submission reference has different saved details."
              : "We could not save the guest card. Please try again.",
        },
        code === "23505" ? 409 : 503,
      );
    }
    // Acknowledge only after durable staging save. No names, contacts, IDs or duplicate hints.
    return authJSON({ success: true }, 200);
  } catch {
    return authJSON(
      {
        success: false,
        message: "We could not confirm the saved guest card. Please try again.",
      },
      503,
    );
  }
}
