import { withRoute } from "@/lib/home-cell/route";
import { NextResponse } from "next/server";
import { actor } from "@/lib/home-cell/admin";
export const dynamic = "force-dynamic";
async function handleGET() {
  try {
    const a = await actor();
    if (!a.churchAdmin && !a.areas.length)
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const [areas, cells] = await Promise.all([
      a.db
        .from("hco_areas")
        .select("id,name")
        .eq("is_active", true)
        .order("name"),
      a.db
        .from("hco_cells")
        .select("id,area_id,name")
        .eq("is_active", true)
        .order("name"),
    ]);
    if (areas.error || cells.error) throw Error("Directory unavailable");
    return NextResponse.json({
      areas: a.churchAdmin
        ? areas.data
        : (areas.data || []).filter((x) => a.areas.includes(x.id)),
      cells: a.churchAdmin
        ? cells.data
        : (cells.data || []).filter((x) => a.areas.includes(x.area_id)),
      churchAdmin: a.churchAdmin,
    });
  } catch {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }
}

export const GET = withRoute("directory", "GET", handleGET);
