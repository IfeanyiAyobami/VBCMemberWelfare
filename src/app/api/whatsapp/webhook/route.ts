import type { NextRequest } from "next/server";
import { authJSON, preventCaching } from "@/lib/auth/http";
import { adminDb } from "@/lib/home-cell/admin";
import { apiConfig, signatureOK, webhookEvents } from "@/lib/whatsapp/core";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const c = apiConfig(),
    p = req.nextUrl.searchParams;
  if (
    !c.verify ||
    c.verify.length < 16 ||
    p.get("hub.mode") !== "subscribe" ||
    p.get("hub.verify_token") !== c.verify ||
    !/^\d{1,200}$/.test(p.get("hub.challenge") || "")
  )
    return authJSON({ message: "Verification failed." }, 403);
  return preventCaching(
    new Response(p.get("hub.challenge"), {
      headers: { "Content-Type": "text/plain" },
    }),
  );
}
export async function POST(req: NextRequest) {
  const c = apiConfig();
  if (!c.secret || !c.phoneId || !c.wabaId)
    return authJSON({ message: "Webhook unavailable." }, 503);
  try {
    const reader = req.body?.getReader();
    if (!reader) return authJSON({ message: "Missing body." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.byteLength;
        if (size > 1000000) {
          await reader.cancel();
          return authJSON({ message: "Event too large." }, 413);
        }
        chunks.push(r.value);
      }
    } finally {
      reader.releaseLock();
    }
    const raw = Buffer.concat(chunks);
    if (!signatureOK(raw, req.headers.get("x-hub-signature-256"), c.secret))
      return authJSON({ message: "Invalid signature." }, 401);
    const events = webhookEvents(
      JSON.parse(raw.toString("utf8")),
      c.phoneId,
      c.wabaId,
    );
    if (events.statuses.length || events.replies.length) {
      const { error } = await adminDb().rpc("care_wa_webhook", {
        p_statuses: events.statuses,
        p_replies: events.replies,
      });
      if (error)
        return authJSON(
          { message: "Event storage unavailable; retry delivery." },
          503,
        );
    }
    return authJSON({ received: true });
  } catch {
    return authJSON({ message: "Invalid event or unavailable storage." }, 400);
  }
}
