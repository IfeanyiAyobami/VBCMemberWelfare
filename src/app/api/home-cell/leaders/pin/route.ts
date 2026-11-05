import { NextRequest } from "next/server";
import { actor } from "@/lib/home-cell/admin";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { readJson } from "@/lib/reliability/json";
import { generatePin, hashPin } from "@/lib/home-cell/pin";
import { authRateLimit } from "@/lib/home-cell/rate-limit";
export async function POST(req: NextRequest) {
  if (!hasSameOrigin(req)) return authJSON({ message: "Invalid origin" }, 403);
  try {
    const a = await actor();
    if (!a.churchAdmin && !a.areas.length)
      return authJSON({ message: "Coordinator access required." }, 403);
    const limited = await authRateLimit(req, "login", a.user.id);
    if (limited) return limited;
    const b = await readJson(req, 2048);
    if (typeof b.user_id !== "string" || !/^[a-f0-9-]{36}$/i.test(b.user_id))
      return authJSON({ message: "Select a leader." }, 400);
    const secret = process.env.HOME_CELL_PIN_SECRET;
    if (!secret || secret.length < 32)
      return authJSON(
        {
          message:
            "Configure HOME_CELL_PIN_SECRET (at least 32 characters) first.",
        },
        503,
      );
    const pin = generatePin();
    const saved = await a.db.rpc("hco_leader_pin_save", {
      p_actor: a.user.id,
      p_user: b.user_id,
      p_hash: await hashPin(pin, secret),
    });
    if (saved.error || saved.data !== true)
      return authJSON(
        {
          message:
            "PIN could not be generated. Apply migration 030 and check that this is an active cell leader within your area, with no higher dashboard roles.",
        },
        409,
      );
    return authJSON({
      ok: true,
      pin,
      message:
        "Copy the PIN now. If lost, generate a replacement; the previous PIN stops working.",
    });
  } catch {
    return authJSON(
      { message: "Unable to generate PIN. Check your coordinator access." },
      403,
    );
  }
}
