import "server-only";
import { cookies } from "next/headers";
import { LOGIN_PREFERENCE, REMEMBER_SECONDS } from "./persistence";
export async function saveLoginPreference(remember: boolean) {
  (await cookies()).set(LOGIN_PREFERENCE, remember ? "1" : "0", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: REMEMBER_SECONDS } : {}),
  });
}
export async function clearLoginPreference() {
  (await cookies()).set(LOGIN_PREFERENCE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
