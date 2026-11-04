import type { NextRequest } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { readJson, PayloadError } from "@/lib/reliability/json";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/staff";
import { adminDb } from "@/lib/home-cell/admin";
import { findAccountByIdentity } from "@/lib/home-cell/accounts";
import { normalizeLoginPhone } from "@/lib/home-cell/identity";
import { hashPin, generatePin } from "@/lib/journey/pin";
export const dynamic = "force-dynamic";
async function access() {
  const client = await createClient();
  const s = await getStaffSession(client);
  if (s.status !== "ready") return null;
  const r = await client.rpc("care_friend_account_manager");
  return !r.error && r.data === true ? s.staff : null;
}
export async function GET() {
  try {
    if (!(await access()))
      return authJSON({ message: "Coordinator access required." }, 403);
    const db = adminDb();
    const accounts = await db
      .from("care_friend_pin_accounts")
      .select("user_id,email,phone,failures");
    if (accounts.error) throw Error();
    if (!accounts.data?.length) return authJSON({ items: [] });
    const staff = await db
      .from("care_staff")
      .select("user_id,display_name,is_active")
      .in(
        "user_id",
        (accounts.data || []).map((x) => x.user_id),
      );
    if (staff.error) throw Error();
    return authJSON({
      items: (accounts.data || []).map((x) => ({
        ...x,
        name:
          staff.data?.find((s) => s.user_id === x.user_id)?.display_name ||
          "Friend",
        active: staff.data?.find((s) => s.user_id === x.user_id)?.is_active,
      })),
    });
  } catch {
    return authJSON(
      {
        message:
          "Friend accounts unavailable. Check migration 027 and the service role key.",
      },
      503,
    );
  }
}
export async function POST(req: NextRequest) {
  if (!hasSameOrigin(req)) return authJSON({ message: "Invalid origin." }, 403);
  try {
    const actor = await access();
    if (!actor)
      return authJSON({ message: "Coordinator access required." }, 403);
    const secret = process.env.FRIEND_PIN_SECRET;
    if (!secret || secret.length < 32)
      return authJSON(
        {
          message:
            "Set FRIEND_PIN_SECRET to a random server-only value of at least 32 characters.",
        },
        503,
      );
    const b = await readJson(req, 4096);
    const db = adminDb();
    let userId: string,
      name: string,
      email: string | null,
      phone: string | null;
    let created = false;
    if (b.action === "reset") {
      if (typeof b.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.userId))
        return authJSON({ message: "Select a Friend account." }, 400);
      const existing = await db
        .from("care_friend_pin_accounts")
        .select("user_id,email,phone")
        .eq("user_id", b.userId)
        .maybeSingle();
      if (existing.error || !existing.data)
        return authJSON({ message: "Friend PIN account not found." }, 404);
      const staff = await db
        .from("care_staff")
        .select("display_name")
        .eq("user_id", b.userId)
        .single();
      if (staff.error) throw Error();
      userId = b.userId;
      name = staff.data.display_name;
      email = existing.data.email;
      phone = existing.data.phone;
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
        (email &&
          (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254))
      )
        return authJSON(
          { message: "Enter a name and a valid email and/or phone number." },
          400,
        );
      let authUser = await findAccountByIdentity(db, {
        email: email || undefined,
        phone: phone || undefined,
      });
      const byEmail = email
        ? await db
            .from("care_friend_pin_accounts")
            .select("user_id")
            .eq("email", email)
            .maybeSingle()
        : null;
      const byPhone = phone
        ? await db
            .from("care_friend_pin_accounts")
            .select("user_id")
            .eq("phone", phone)
            .maybeSingle()
        : null;
      if (byEmail?.error || byPhone?.error) throw Error();
      if (byEmail?.data || byPhone?.data)
        return authJSON(
          {
            message:
              "A Friend PIN account already uses this contact. Use Reset PIN on that account.",
          },
          409,
        );
      if (authUser) {
        const hco = await db
          .from("hco_assignments")
          .select("id")
          .eq("user_id", authUser.id)
          .eq("active", true);
        if (hco.error) throw Error();
        if (hco.data?.length) {
          const staffState = await db
            .from("care_staff")
            .select("is_active")
            .eq("user_id", authUser.id)
            .maybeSingle();
          if (staffState.error) throw Error();
          if (staffState.data && staffState.data.is_active !== true)
            return authJSON(
              {
                message:
                  "This staff account is inactive. Ask the church administrator to review its access.",
              },
              409,
            );
          // The Home Cell Auth identity/password/roles are never changed.
          // Contacts identify an independent Friend credential record.
          authUser = null;
        }
      }
      if (authUser) {
        const staff = await db
          .from("care_staff")
          .select("role,is_active")
          .eq("user_id", authUser.id)
          .maybeSingle();
        if (
          staff.error ||
          !staff.data ||
          staff.data.role !== "followup_worker" ||
          !staff.data.is_active
        )
          return authJSON(
            {
              message:
                "This login already exists outside Friend-only access. Use Team & access for its existing permissions.",
            },
            409,
          );
        userId = authUser.id;
      } else {
        const made = await db.auth.admin.createUser({
          email: randomUUID() + "@friend-login.invalid",
          password: randomBytes(48).toString("base64url"),
          email_confirm: true,
        });
        if (made.error || !made.data.user)
          return authJSON(
            {
              message:
                "Could not create the account. Check whether that email is already registered.",
            },
            409,
          );
        userId = made.data.user.id;
        created = true;
      }
    } else return authJSON({ message: "Choose create or reset." }, 400);
    const pin = generatePin();
    const hash = await hashPin(pin, secret);
    const saved = await db.rpc("care_friend_pin_save", {
      p_actor: actor.user_id,
      p_user: userId,
      p_name: name,
      p_email: email,
      p_phone: phone,
      p_hash: hash,
    });
    if (saved.error || saved.data !== true) {
      if (
        created &&
        saved.error?.code &&
        ["23505", "42501", "22023", "23514", "23502"].includes(saved.error.code)
      )
        await db.auth.admin.deleteUser(userId);
      return authJSON(
        {
          message:
            saved.error?.code === "23505"
              ? "This contact is already used. Refresh Friend accounts."
              : saved.error?.code === "42501"
                ? "PIN access is only available for active Friend-only accounts."
                : "Could not save Friend access. Refresh the list before retrying.",
        },
        saved.error?.code === "42501" ? 403 : 409,
      );
    }
    return authJSON({
      saved: true,
      pin,
      name,
      email,
      phone,
      loginPath: "/friend-login",
    });
  } catch (e) {
    return authJSON(
      {
        message:
          e instanceof PayloadError
            ? e.message
            : "Could not confirm account creation. Refresh the accounts list before retrying.",
      },
      e instanceof PayloadError ? e.status : 503,
    );
  }
}
