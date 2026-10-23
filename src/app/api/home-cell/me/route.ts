import { withRoute } from "@/lib/home-cell/route";
import { NextResponse } from "next/server";
import { actor } from "@/lib/home-cell/admin";
export const dynamic = "force-dynamic";
async function handleGET() {
  try {
    const a = await actor();
    return NextResponse.json({
      email: a.user.email,
      churchAdmin: a.churchAdmin,
      assignments: a.assignments,
    });
  } catch {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }
}

export const GET = withRoute("me", "GET", handleGET);
