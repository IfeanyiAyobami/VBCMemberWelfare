import { NextRequest, NextResponse } from "next/server";
import { isCareRoute } from "@/lib/routes";

export function preventCaching<T extends Response>(response: T) {
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Netlify-CDN-Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export function authJSON(body: unknown, status = 200) {
  return preventCaching(NextResponse.json(body, { status }));
}

export function hasSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !!origin && origin === request.nextUrl.origin;
}

export function safeNextPath(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes(String.fromCharCode(92)) ||
    [...value].some((c) => c.charCodeAt(0) <= 32)
  )
    return "/overview";
  try {
    const parsed = new URL(value, "https://care.invalid");
    if (
      parsed.origin !== "https://care.invalid" ||
      parsed.pathname.startsWith("/access") ||
      parsed.pathname.startsWith("/api/") ||
      parsed.pathname.startsWith("/auth/")
    )
      return "/overview";
    // Only reviewed dashboard routes may be used as a post-login destination.
    const path = parsed.pathname.slice(1);
    const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
    return isCareRoute(normalized)
      ? parsed.pathname + parsed.search
      : "/overview";
  } catch {
    return "/overview";
  }
}
