import "server-only";
import { actor } from "./admin";
export async function workspaceScope(id: string | null) {
  const a = await actor();
  const selected =
    id && id !== "all" ? a.assignments.find((x) => x.id === id) : null;
  if (id && id !== "all" && !selected) throw Error("FORBIDDEN");
  if (id === "all" && !a.churchAdmin) throw Error("FORBIDDEN");
  const assignments = selected ? [selected] : a.assignments;
  const global =
    (a.churchAdmin && (!id || id === "all")) ||
    selected?.role === "church_admin";
  let q = a.db
    .from("hco_cells")
    .select("id,area_id,name,address,meeting_day,meeting_start,meeting_end")
    .eq("is_active", true)
    .order("name");
  const areas = assignments
    .filter((x) => x.area_id)
    .map((x) => x.area_id as string);
  const cells = assignments
    .filter((x) => x.cell_id)
    .map((x) => x.cell_id as string);
  if (!global) {
    const filters = [];
    if (areas.length) filters.push(`area_id.in.(${areas.join(",")})`);
    if (cells.length) filters.push(`id.in.(${cells.join(",")})`);
    if (!filters.length) throw Error("FORBIDDEN");
    q = q.or(filters.join(","));
  }
  const result = await q;
  if (result.error) throw Error("DATA_UNAVAILABLE");
  return {
    ...a,
    cells: result.data || [],
    global,
    manager:
      !!global ||
      assignments.some((x) => ["coordinator", "area_leader"].includes(x.role)),
    scope: selected?.id || (global ? "all" : ""),
  };
}
