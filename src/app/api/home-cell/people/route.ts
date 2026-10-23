import { withRoute } from "@/lib/home-cell/route";
import {normalizeMemberPhone} from "@/lib/members/model";
import { NextRequest } from "next/server";
import { workspaceScope } from "@/lib/home-cell/workspace";
import { authJSON } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
async function handleGET(req: NextRequest) {
  try {
    const a = await workspaceScope(req.nextUrl.searchParams.get("scope"));
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 3 || q.length > 100)
      return authJSON(
        { message: "Enter at least 3 characters (maximum 100)." },
        400,
      );
    const literal = q.replace(/[^\p{L}\p{N}\s@.+'-]/gu, "");
    if (literal.length < 3)
      return authJSON({ message: "Enter a name, phone number or email." }, 400);
    const normalizedPhone = normalizeMemberPhone(q);
    const filter = ["other_names", "surname", "phone", "email"]
      .map((k) => `${k}.ilike.%${k === "phone" && normalizedPhone ? normalizedPhone : literal}%`)
      .join(",");
    const [m, g] = await Promise.all([
      a.db
        .from("care_members")
        .select("id,other_names,surname,phone,email,status")
        .is("archived_at", null)
        .or(filter)
        .limit(15),
      a.db
        .from("care_guest_submissions")
        .select("id,other_names,surname,phone,email")
        .or(filter)
        .limit(15),
    ]);
    if (m.error || g.error) throw Error("DATA_UNAVAILABLE");
    return authJSON({ members: m.data, guests: g.data });
  } catch {
    return authJSON(
      { message: "Search unavailable. Verify Home Cell access." },
      403,
    );
  }
}

export const GET = withRoute("people", "GET", handleGET);
