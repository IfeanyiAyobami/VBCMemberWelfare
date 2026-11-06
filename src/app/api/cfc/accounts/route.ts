import { NextRequest } from "next/server";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/home-cell/admin";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { readJson } from "@/lib/reliability/json";
import { normalizeLoginPhone } from "@/lib/home-cell/identity";
import { generatePin, hashPin } from "@/lib/cfc-pin";
import { authRateLimit } from "@/lib/home-cell/rate-limit";
export async function POST(req: NextRequest) {
  if (!hasSameOrigin(req)) return authJSON({ message: "Invalid origin." }, 403);
  let created: string | undefined;
  const db = adminDb();
  try {
    const c = await createClient();
    const user = await c.auth.getUser();
    if (!user.data.user)
      return authJSON(
        { message: "Sign in as the Follow Through coordinator." },
        403,
      );
    const allowed = await c.rpc("care_friend_account_manager");
    if (allowed.error || allowed.data !== true)
      return authJSON(
        { message: "Follow Through coordinator access required." },
        403,
      );
    const limited = await authRateLimit(
      req,
      "login",
      "cfc-account:" + user.data.user.id,
    );
    if (limited) return limited;
    const secret = process.env.CFC_PIN_SECRET;
    if (!secret || secret.length < 32)
      return authJSON(
        {
          message:
            "Configure server-only CFC_PIN_SECRET with at least 32 random characters.",
        },
        503,
      );
    const b = await readJson(req, 4096);
    let name: string,
      email: string | null,
      phone: string | null,
      target: string;
    if (b.action === "reset") {
      if (typeof b.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.userId))
        return authJSON({ message: "Select a CFC leader." }, 400);
      const result = await db
        .from("care_cfc_leaders")
        .select("user_id,email,phone")
        .eq("user_id", b.userId)
        .single();
      const staff = await db
        .from("care_staff")
        .select("display_name")
        .eq("user_id", b.userId)
        .single();
      if (result.error || staff.error)
        return authJSON({ message: "CFC account not found." }, 404);
      target = b.userId;
      name = staff.data.display_name;
      email = result.data.email;
      phone = result.data.phone;
    } else if (b.action === "create") {
      name = typeof b.name === "string" ? b.name.trim() : "";
      email =
        typeof b.email === "string" && b.email.trim()
          ? b.email.trim().toLowerCase()
          : null;
      phone =
        typeof b.phone === "string" && b.phone.trim()
          ? normalizeLoginPhone(b.phone)
          : null;
      if (
        name.length < 2 ||
        name.length > 120 ||
        (!email && !phone) ||
        (b.phone && !phone) ||
        (email && (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)))
      )
        return authJSON(
          { message: "Enter a name and valid email and/or phone." },
          400,
        );
      const made = await db.auth.admin.createUser({
        email: randomUUID() + "@cfc-login.invalid",
        password: randomBytes(48).toString("base64url"),
        email_confirm: true,
        app_metadata: { cfc_dashboard_only: true },
      });
      if (made.error || !made.data.user) throw Error("CREATE");
      target = made.data.user.id;
      created = target;
    } else return authJSON({ message: "Invalid account action." }, 400);
    const pin = generatePin();
    const result = await db.rpc("care_cfc_pin_save", {
      p_actor: user.data.user.id,
      p_user: target,
      p_name: name,
      p_email: email,
      p_phone: phone,
      p_hash: await hashPin(pin, secret),
    });
    if (
      result.error?.code === "22023" &&
      result.error.message === "Five active CFC accounts already exist."
    ) {
      if (created) await db.auth.admin.deleteUser(created);
      return authJSON({ message: result.error.message }, 409);
    }
    if (result.error || result.data !== true) throw Error("SAVE");
    created = undefined;
    return authJSON({
      pin,
      name,
      email,
      phone,
      message: "Copy this PIN now. If lost, generate a replacement.",
    });
  } catch {
    if (created) await db.auth.admin.deleteUser(created);
    return authJSON(
      {
        message:
          "Account could not be confirmed. Check the account list before retrying; the contact may already have a CFC account. Check migrations 031 and 032.",
      },
      409,
    );
  }
}

export async function GET() {
  try {
    const c = await createClient();
    const r = await c.rpc("care_cfc_read", { p_search: "" });
    if (r.error || !r.data?.manager)
      return authJSON(
        { message: "Follow Through coordinator access required." },
        403,
      );
    return authJSON({
      items: r.data.leaders,
      cohorts: r.data.cohorts,
      teaching: r.data.teaching,
    });
  } catch {
    return authJSON({ message: "Accounts unavailable." }, 503);
  }
}
