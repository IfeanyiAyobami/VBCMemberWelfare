import { boundedFetch } from "@/lib/reliability/fetch";
import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { authJSON } from "@/lib/auth/http";
import { isMemberId } from "@/lib/members/model";
import {
  canonicalGateway,
  validateGateway,
  GATEWAY_EVIDENCE,
} from "@/lib/guests/gateway";
import {
  gatewayTokenConfigured,
  validGatewayToken,
} from "@/lib/guests/gateway-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = process.env.VBC_MEMBER_CARE_GATEWAY_TOKEN || "";
  const key = process.env.SUPABASE_SECRET_KEY || "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (
    process.env.VBC_MEMBER_CARE_GATEWAY_ENABLED !== "true" ||
    !gatewayTokenConfigured(token) ||
    !key ||
    !url
  )
    return authJSON(
      {
        success: false,
        code: "not_configured",
        message: "Member Care intake is not configured.",
      },
      503,
    );
  // Authenticate before parsing the visitor body. Staff cookies grant no access.
  if (!validGatewayToken(request.headers.get("authorization"), token))
    return authJSON(
      {
        success: false,
        code: "unauthorized",
        message: "Invalid integration credentials.",
      },
      401,
    );
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    return authJSON(
      {
        success: false,
        code: "invalid_content_type",
        message: "Send application/json.",
      },
      415,
    );
  const reader = request.body?.getReader();
  if (!reader)
    return authJSON(
      { success: false, code: "invalid_payload", message: "Missing payload." },
      400,
    );
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
          {
            success: false,
            code: "payload_too_large",
            message: "Payload exceeds 32 KB.",
          },
          413,
        );
      }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
  } catch {
    return authJSON(
      {
        success: false,
        code: "invalid_payload",
        message: "Invalid payload encoding.",
      },
      400,
    );
  } finally {
    reader.releaseLock();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return authJSON(
      { success: false, code: "invalid_payload", message: "Invalid JSON." },
      400,
    );
  }
  const valid = validateGateway(parsed, request.headers.get("idempotency-key"));
  if (!valid.ok)
    return authJSON(
      {
        success: false,
        code: "invalid_payload",
        field: valid.field,
        message: "Check the indicated Gateway field.",
      },
      400,
    );
  const submissionId = valid.payload.submission_id;
  try {
    const supabase = createClient(url, key, {
      global: { fetch: boundedFetch },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await supabase.rpc(
      "care_ingest_wordpress_gateway",
      {
        p_submission_key: submissionId,
        p_guest: valid.guest,
        p_evidence: GATEWAY_EVIDENCE,
        p_payload_hash: createHash("sha256")
          .update(canonicalGateway(valid.payload))
          .digest("hex"),
        p_submitted_at: valid.payload.date_submitted,
      },
    );
    if (
      error ||
      !data ||
      !isMemberId(data.id) ||
      typeof data.duplicate !== "boolean"
    ) {
      const conflict = error?.code === "23505";
      // UUID and outcome only. Never print the RPC error, token or visitor data.
      console.warn(
        JSON.stringify({
          event: "vbc_gateway",
          submission_id: submissionId,
          outcome: conflict ? "conflict" : "storage_unavailable",
        }),
      );
      return authJSON(
        {
          success: false,
          code: conflict ? "submission_conflict" : "storage_unavailable",
          message: conflict
            ? "This submission ID has different saved details. Review it before retrying."
            : "Member Care could not confirm storage. Retry later.",
        },
        conflict ? 409 : 503,
      );
    }
    return authJSON(
      { success: true, id: data.id, duplicate: data.duplicate },
      data.duplicate ? 200 : 201,
    );
  } catch {
    console.warn(
      JSON.stringify({
        event: "vbc_gateway",
        submission_id: submissionId,
        outcome: "storage_unavailable",
      }),
    );
    return authJSON(
      {
        success: false,
        code: "storage_unavailable",
        message: "Member Care could not confirm storage. Retry later.",
      },
      503,
    );
  }
}
