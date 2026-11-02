import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/staff";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request))
    return authJSON({ message: "Invalid origin." }, 403);
  try {
    const client = await createClient(),
      session = await getStaffSession(client);
    if (session.status !== "ready")
      return authJSON({ message: "Active staff access required." }, 403);
    const permission = await client.rpc("care_programme_can_edit");
    if (permission.error || permission.data !== true)
      return authJSON({ message: "Programme editor access required." }, 403);
    // Bound the multipart stream as well as the decoded file, even without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return authJSON({ message: "Choose a flyer." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4259840) {
        await reader.cancel();
        return authJSON({ message: "Choose a flyer of 4 MB or less." }, 413);
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks),
      form = await new Response(bytes, {
        headers: { "Content-Type": request.headers.get("content-type") || "" },
      }).formData(),
      file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 4194304)
      return authJSON(
        { message: "Choose a JPG, PNG or WebP flyer of 4 MB or less." },
        400,
      );
    const b = Buffer.from(await file.arrayBuffer());
    let ext = "";
    let mime = "";
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
      ext = "jpg";
      mime = "image/jpeg";
    } else if (
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      ext = "png";
      mime = "image/png";
    } else if (
      b.subarray(0, 4).toString() === "RIFF" &&
      b.subarray(8, 12).toString() === "WEBP"
    ) {
      ext = "webp";
      mime = "image/webp";
    }
    if (!ext || file.type !== mime)
      return authJSON(
        {
          message:
            "Upload a real JPG, PNG or WebP image. SVG and renamed files are not accepted.",
        },
        400,
      );
    const key = session.staff.user_id + "/" + crypto.randomUUID() + "." + ext,
      r = await client.storage
        .from("care-programme-flyers")
        .upload(key, b, {
          contentType: mime,
          upsert: false,
          cacheControl: "3600",
        });
    if (r.error)
      return authJSON(
        {
          message:
            "The flyer was not uploaded. Check Storage setup and try again.",
        },
        503,
      );
    return authJSON({
      path: key,
      image: client.storage.from("care-programme-flyers").getPublicUrl(key).data
        .publicUrl,
    });
  } catch {
    return authJSON(
      {
        message:
          "The flyer could not be uploaded. Keep the form open and try again.",
      },
      503,
    );
  }
}
