import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
import { readJson, PayloadError } from "@/lib/reliability/json";
export const dynamic = "force-dynamic";
function failure(error: { code?: string; message?: string }) {
  return authJSON(
    {
      message: ["42501", "22023", "23505"].includes(error.code || "")
        ? error.message
        : "CFC service unavailable. Check migrations 031 and 032.",
    },
    error.code === "42501"
      ? 403
      : error.code === "22023" || error.code === "23505"
        ? 400
        : 503,
  );
}
export async function GET(req: NextRequest) {
  try {
    const c = await createClient();
    const { data, error } = await c.rpc("care_cfc_read", {
      p_search: req.nextUrl.searchParams.get("search") || "",
    });
    return error ? failure(error) : authJSON(data);
  } catch {
    return authJSON({ message: "CFC dashboard unavailable." }, 503);
  }
}
export async function POST(req: NextRequest) {
  if (!hasSameOrigin(req)) return authJSON({ message: "Invalid origin." }, 403);
  try {
    const b = await readJson(req, 8192);
    if (
      typeof b.action !== "string" ||
      !b.data ||
      typeof b.data !== "object" ||
      Array.isArray(b.data)
    )
      return authJSON({ message: "Invalid CFC request." }, 400);
    const c = await createClient();
    const { data, error } = await c.rpc("care_cfc_write", {
      p_action: b.action,
      p_data: b.data,
    });
    return error ? failure(error) : authJSON({ ok: data === true });
  } catch (e) {
    return authJSON(
      {
        message:
          e instanceof PayloadError
            ? e.message
            : "Unable to save. Your form is unchanged; check the saved record before retrying.",
      },
      e instanceof PayloadError ? e.status : 503,
    );
  }
}
