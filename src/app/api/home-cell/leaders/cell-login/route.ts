import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { actor } from "@/lib/home-cell/admin";
import { findAccountByEmail } from "@/lib/home-cell/accounts";
import { publicLoginEmail } from "@/lib/home-cell/phone-usernames";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { readJson } from "@/lib/reliability/json";
import { generatePin, hashPin } from "@/lib/home-cell/pin";
import { authRateLimit } from "@/lib/home-cell/rate-limit";
export async function POST(req: NextRequest) {
  if (!hasSameOrigin(req)) return authJSON({ message: "Invalid origin." }, 403);
  try {
    const a = await actor();
    if (!a.churchAdmin)
      return authJSON(
        { message: "A Church Admin must set up separate login access." },
        403,
      );
    const limited = await authRateLimit(req, "login", a.user.id);
    if (limited) return limited;
    const b = await readJson(req, 2048);
    if (
      typeof b.user_id !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(b.user_id) ||
      b.user_id === a.user.id
    )
      return authJSON({ message: "Choose another leader's account." }, 400);
    const secret = process.env.HOME_CELL_PIN_SECRET;
    if (!secret || secret.length < 32)
      return authJSON(
        { message: "Home Cell PIN sign-in is not configured." },
        503,
      );
    const { data: owner, error: ownerError } =
      await a.db.auth.admin.getUserById(b.user_id);
    if (ownerError || !owner.user)
      return authJSON({ message: "Account not found." }, 404);
    const assigned = await a.db
      .from("hco_assignments")
      .select("role")
      .eq("user_id", b.user_id)
      .eq("active", true);
    const staff = await a.db
      .from("care_staff")
      .select("role,is_active")
      .eq("user_id", b.user_id)
      .maybeSingle();
    if (assigned.error || staff.error) throw Error("Access check unavailable");
    if (
      !assigned.data?.some((x) => x.role === "cell_leader") ||
      !(
        assigned.data.some((x) =>
          ["church_admin", "coordinator"].includes(x.role),
        ) ||
        (staff.data?.role === "administrator" && staff.data.is_active)
      )
    )
      return authJSON(
        {
          message:
            "Keep both the Cell Leader role and the Church Admin or Coordinator role. Use Add role if promotion replaced the cell assignment.",
        },
        409,
      );
    const email = `cell-${b.user_id}@home-cell.invalid`;
    let leader = await findAccountByEmail(a.db, email);
    if (!leader) {
      const created = await a.db.auth.admin.createUser({
        email,
        email_confirm: true,
        password: randomBytes(32).toString("base64url"),
        user_metadata: {
          full_name: owner.user.user_metadata?.full_name || "Cell Leader",
        },
        app_metadata: { hco_cell_login_for: b.user_id },
      });
      if (created.error) leader = await findAccountByEmail(a.db, email);
      else leader = created.data.user;
    }
    if (!leader || leader.app_metadata?.hco_cell_login_for !== b.user_id)
      throw Error("Linked identity unavailable");
    const pin = generatePin();
    const saved = await a.db.rpc("hco_cell_login_save", {
      p_actor: a.user.id,
      p_owner: b.user_id,
      p_user: leader.id,
      p_hash: await hashPin(pin, secret),
    });
    if (saved.error || saved.data !== true)
      return authJSON(
        {
          message:
            "Separate access could not be saved. Apply migrations 034 and 035 and check the active assignments. No PIN was returned; retry here after correction.",
        },
        409,
      );
    const phone = await a.db
      .from("hco_phone_usernames")
      .select("phone")
      .eq("user_id", b.user_id)
      .maybeSingle();
    return authJSON({
      ok: true,
      pin,
      login:
        publicLoginEmail(owner.user.email) ||
        phone.data?.phone ||
        owner.user.phone ||
        "",
      message:
        "Use this PIN for Cell Leader sign-in. The Church Admin or Coordinator password is unchanged.",
    });
  } catch {
    return authJSON(
      {
        message:
          "Separate login setup is unavailable. Check administrator access and retry; no credentials were returned.",
      },
      503,
    );
  }
}
