import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/staff";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { readJson, PayloadError } from "@/lib/reliability/json";
import { uuid } from "@/lib/journey/model";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const client = await createClient(),
      session = await getStaffSession(client);
    if (session.status !== "ready")
      return authJSON({ message: "Active staff access required." }, 403);
    const [read, edit] = await Promise.all([
      client
        .from("care_programmes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2001),
      client.rpc("care_programme_can_edit"),
    ]);
    if (read.error || edit.error) throw Error("setup");
    if (read.data.length > 2000)
      return authJSON(
        {
          message:
            "Programme directory limit reached. Contact the administrator.",
        },
        503,
      );
    return authJSON({
      items: read.data.map((p) => ({
        ...p,
        image: p.flyer_path
          ? client.storage
              .from("care-programme-flyers")
              .getPublicUrl(p.flyer_path).data.publicUrl
          : null,
      })),
      canEdit: edit.data === true,
    });
  } catch {
    return authJSON(
      {
        message:
          "Saved programmes could not be loaded. Check migration 023 and refresh.",
      },
      503,
    );
  }
}
export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request))
    return authJSON({ message: "Invalid origin." }, 403);
  try {
    const body = await readJson(request, 16384);
    if (
      typeof body.requestId !== "string" ||
      !uuid.test(body.requestId) ||
      !body.data ||
      typeof body.data !== "object" ||
      Array.isArray(body.data)
    )
      return authJSON({ message: "Invalid programme save." }, 400);
    const client = await createClient(),
      session = await getStaffSession(client);
    if (session.status !== "ready")
      return authJSON({ message: "Active staff access required." }, 403);
    const { data, error } = await client.rpc("care_programme_save", {
      p_data: body.data,
      p_request: body.requestId,
    });
    if (error)
      return authJSON(
        {
          message:
            error.code === "40001"
              ? error.message
              : error.code === "42501"
                ? "Programme editor access is required."
                : error.code?.startsWith("22") ||
                    ["23514", "23502"].includes(error.code)
                  ? "Check programme name, schedule, time, venue and link."
                  : "Could not confirm the save. Keep this form open and retry safely.",
        },
        error.code === "40001"
          ? 409
          : error.code === "42501"
            ? 403
            : error.code?.startsWith("22") ||
                ["23514", "23502"].includes(error.code)
              ? 400
              : 503,
      );
    return authJSON({
      item: {
        ...data,
        image: data.flyer_path
          ? client.storage
              .from("care-programme-flyers")
              .getPublicUrl(data.flyer_path).data.publicUrl
          : null,
      },
    });
  } catch (e) {
    return authJSON(
      {
        message:
          e instanceof PayloadError
            ? e.message
            : "Could not confirm the save. Keep this form open and retry.",
      },
      e instanceof PayloadError ? e.status : 503,
    );
  }
}
