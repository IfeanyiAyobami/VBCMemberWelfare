import { withRoute } from "@/lib/home-cell/route";
import {internalLoginEmail,publicLoginEmail} from "@/lib/home-cell/phone-usernames";
import { createHash, randomBytes } from "node:crypto";
import { normalizeLoginPhone } from "@/lib/home-cell/identity";
import { authJSON } from "@/lib/auth/http";
import { NextRequest, NextResponse } from "next/server";
import { findAccountByIdentity } from "@/lib/home-cell/accounts";
import { actor } from "@/lib/home-cell/admin";
import { hasSameOrigin } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
const reply = (body: unknown, options?: {status: number}) => authJSON(body, options?.status || 200);
const roles = ["church_admin", "coordinator", "area_leader", "cell_leader"];
async function handleGET() {
  try {
    const a = await actor();
    if (!a.churchAdmin && !a.areas.length)
      return reply({ message: "Forbidden" }, { status: 403 });
    const { data, error } = await a.db
      .from("hco_assignments")
      .select("id,user_id,role,area_id,cell_id,active,created_at")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const scopedCells = a.churchAdmin
      ? []
      : (
          await a.db.from("hco_cells").select("id").in("area_id", a.areas)
        ).data?.map((x) => x.id) || [];
    const allowed = a.churchAdmin
      ? data
      : (data || []).filter(
          (x) =>
            (x.area_id && a.areas.includes(x.area_id)) ||
            (x.cell_id && scopedCells.includes(x.cell_id)),
        );
    const userIds = [...new Set((allowed || []).map((x) => x.user_id))];
    const identities: Record<
      string,
      { email: string; phone: string; name: string; lastSignIn: string | null; passwordChangeRequired: boolean }
    > = {};
    for (let i = 0; i < userIds.length; i += 10) {
      await Promise.all(
        userIds.slice(i, i + 10).map(async (id) => {
          const { data, error } = await a.db.auth.admin.getUserById(id);
          if (error) throw error;
          if (data.user)
            identities[id] = {
              email: data.user.email || "",
              phone: data.user.phone ? "+" + data.user.phone.replace(/\D/g, "") : "",
              name: String(
                data.user.user_metadata?.full_name || publicLoginEmail(data.user.email) || data.user.app_metadata?.hco_phone_username || data.user.phone || "Leader",
              ),
              lastSignIn: data.user.last_sign_in_at || null,
              passwordChangeRequired: data.user.app_metadata?.hco_password_change_required === true,
            };
        }),
      );
    }
    const usernameResult = await a.db.from("hco_phone_usernames").select("user_id,phone").in("user_id",userIds);
    if(usernameResult.error) return reply({message:"Apply migration 013 to manage phone usernames."},{status:503});
    const access = await a.db
      .from("hco_access")
      .select("user_id,suspended_at")
      .in("user_id", userIds);
    if (access.error) throw access.error;
    return reply({
      leaders: (allowed || []).map((x) => ({
        ...x,
        ...identities[x.user_id],
        email: publicLoginEmail(identities[x.user_id]?.email),
        phone: usernameResult.data?.find(p=>p.user_id===x.user_id)?.phone || identities[x.user_id]?.phone || "",
        needsPhoneRepair: !!identities[x.user_id]?.phone && !identities[x.user_id]?.email,
        suspended: !!access.data?.find((y) => y.user_id === x.user_id)
          ?.suspended_at,
      })),
      churchAdmin: a.churchAdmin,
      actorId: a.user.id,
      limit: 500,
    });
  } catch {
    return reply({ message: "Access denied" }, { status: 403 });
  }
}
async function handlePOST(req: NextRequest) {
  if (!hasSameOrigin(req))
    return reply({ message: "Invalid origin" }, { status: 403 });
  try {
    const body = await req.json();
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const rawPhone = String(body.phone || "").trim();
    const phone = rawPhone ? normalizeLoginPhone(rawPhone) : null;
    const role = String(body.role || "");
    const areaId = body.area_id || null;
    const cellId = body.cell_id || null;
    if (email.endsWith("@home-cell.invalid")) return reply({message:"Enter a real email address or a phone number."},{status:400});
    if ((!email && !phone) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (rawPhone && !phone) || !roles.includes(role))
      return reply(
        { message: "Enter a valid email or phone number and leadership role" },
        { status: 400 },
      );
    const a = await actor();
    if (!a.churchAdmin && !["area_leader", "cell_leader"].includes(role))
      return reply({ message: "Forbidden" }, { status: 403 });
    if (
      (role === "church_admin" && (areaId || cellId)) ||
      (role === "coordinator" && !areaId) ||
      (role === "area_leader" && !areaId) ||
      (role === "cell_leader" && !cellId)
    )
      return reply(
        { message: "Assignment scope required" },
        { status: 400 },
      );
    if (role === "cell_leader") {
      const { data: cell } = await a.db
        .from("hco_cells")
        .select("area_id")
        .eq("id", cellId)
        .maybeSingle();
      if (!cell || (!a.churchAdmin && !a.areas.includes(cell.area_id)))
        return reply(
          { message: "Cell outside your areas" },
          { status: 403 },
        );
      if (!a.churchAdmin && !a.areas.includes(cell.area_id))
        return reply(
          { message: "Outside your area" },
          { status: 403 },
        );
      if (areaId && cell.area_id !== areaId)
        return reply(
          { message: "Area/cell mismatch" },
          { status: 400 },
        );
    }
    if (role === "area_leader" && !a.churchAdmin && !a.areas.includes(areaId))
      return reply(
        { message: "Outside your area" },
        { status: 403 },
      );
    if (!a.churchAdmin && !a.areas.length) throw new Error("FORBIDDEN");
    if (role !== "church_admin" && role !== "cell_leader") {
      const { data: area, error: areaError } = await a.db
        .from("hco_areas")
        .select("id")
        .eq("id", areaId)
        .eq("is_active", true)
        .maybeSingle();
      if (areaError || !area)
        return reply(
          { message: "Select an active area" },
          { status: 400 },
        );
    }
    if (
      (role === "church_admin" && (areaId || cellId)) ||
      (role !== "cell_leader" && cellId)
    )
      return reply(
        { message: "Invalid scope for role" },
        { status: 400 },
      );
    const { error: setupError } = await a.db.rpc("hco_session_allowed", {
      p_user: a.user.id,
      p_session: "00000000-0000-0000-0000-000000000000",
    });
    if (setupError)
      return reply(
        {
          message:
            "Apply migration 011 and verify server database access before creating leaders.",
        },
        { status: 503 },
      );
    const phoneSetup = await a.db.from("hco_phone_usernames").select("user_id").limit(1);
    if(phoneSetup.error) return reply({message:"Apply migration 013 before creating leaders."},{status:503});
    const confirmExisting = (user: { email?: string; phone?: string }) =>
      reply(
        {
          code: "EXISTING_ACCOUNT_CONFIRMATION_REQUIRED",
          message:
            "An account already exists for this email or phone number. Add the selected leadership role to this existing account? Its password and current assignments will stay unchanged. Any supplied phone number will be registered as a login username if available.",
          email: publicLoginEmail(user.email) || user.phone || phone,
        },
        { status: 409 },
      );
    let existing = await findAccountByIdentity(a.db, {email: email || undefined, phone: phone || undefined});
    if (existing && body.confirm_existing !== true)
      return confirmExisting(existing);
    if (body.existing_only && !existing)
      return reply(
        {
          message:
            "No login account exists for this email or phone. Choose Create leader to generate a temporary password.",
        },
        { status: 404 },
      );
    let target = existing?.id;
    let invitedNew = false;
    let temporaryPassword: string | undefined;
    if (!target) {
      temporaryPassword = "Vbc!" + randomBytes(18).toString("base64url") + "7a";
      const {data: created, error: createError} = await a.db.auth.admin.createUser({
        email: email || internalLoginEmail(),
        email_confirm: true,
        password: temporaryPassword,
        user_metadata: {full_name: String(body.full_name || "").trim().slice(0, 160)},
        app_metadata: {hco_phone_username: phone, hco_password_change_required: true, hco_temporary_password_hash: createHash("sha256").update(temporaryPassword).digest("hex")},
      });
      if (createError || !created.user) {
        existing = await findAccountByIdentity(a.db, {email: email || undefined, phone: phone || undefined});
        if (existing) return confirmExisting(existing);
        return reply({message: createError?.message || "Account creation failed"}, {status: 400});
      }
      target = created.user.id;
      invitedNew = true;
    }
    const { error } = await a.db.rpc("hco_phone_leadership_write", {
      p_actor: a.user.id,
      p_action: "assign",
      p_data: {
        user_id: target,
        phone,
        role,
        area_id: role === "church_admin" ? null : areaId,
        cell_id: cellId,
        reason:
          typeof body.reason === "string" && body.reason.trim().length >= 5
            ? body.reason.trim()
            : invitedNew
              ? "Administrator account creation and leadership assignment"
              : "Verified existing-account leadership assignment",
      },
    });
    if (error && invitedNew) {
      const cleanup = await a.db.auth.admin.deleteUser(target!);
      if (cleanup.error) return reply({message: "Account creation was incomplete and needs administrator reconciliation. No credentials were returned."}, {status: 503});
    }
    if (error)
      return reply(
        {
          message:
            error.code === "23505"
              ? "This account already has the selected leadership assignment."
              : error.message.includes("HCO_")
                ? error.message
                : invitedNew
                  ? "Account was created but its role could not be saved. Contact the administrator before retrying."
                  : "The account was found, but the leadership assignment could not be saved. Refresh and verify the selected role and area.",
        },
        { status: 409 },
      );
    return reply({
      ok: true,
      user_id: target,
      existing_account: !invitedNew,
      ...(invitedNew ? {temporary_password: temporaryPassword, login: email || phone} : {}),
      message: invitedNew
        ? "Leader created. Copy the temporary password now; it will not be shown again."
        : "Leadership role added to the existing account. Their current password and assignments are unchanged.",
    });
  } catch (e) {
    return reply(
      { message: e instanceof Error ? e.message : "Unable to create leader" },
      { status: 403 },
    );
  }
}

export const GET = withRoute("leaders", "GET", handleGET);
export const POST = withRoute("leaders", "POST", handlePOST);
