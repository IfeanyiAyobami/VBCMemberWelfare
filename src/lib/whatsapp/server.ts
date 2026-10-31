import "server-only";
import { adminDb } from "@/lib/home-cell/admin";
import { apiConfig, deliverWithMeta, type WaJob } from "./core";
export async function dispatchInvitation(id: string) {
  const config = apiConfig();
  if (!config.ready) throw Error("WhatsApp API is not configured.");
  const db = adminDb();
  const { data, error } = await db.rpc("care_wa_claim", {
    p_message: id,
    p_daily_limit: Math.min(
      10000,
      Math.max(1, Math.floor(Number(process.env.WHATSAPP_DAILY_LIMIT)) || 100),
    ),
  });
  if (error) throw Error("Unable to claim invitation.");
  if (!data) return;
  const result = await deliverWithMeta(
    data as WaJob,
    config,
    fetch,
    async () => {
      const gate = await db.rpc("care_wa_dispatch_allowed", { p_message: id });
      return !gate.error && gate.data === true;
    },
  );
  const saved = await db.rpc("care_wa_finish", {
    p_message: id,
    p_state: result.state,
    p_provider: result.provider,
    p_error: result.code,
  });
  if (saved.error)
    throw Error("Result not saved. Refresh status; do not send again.");
}
