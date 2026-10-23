import "server-only";
import {randomUUID} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
export function internalLoginEmail() { return randomUUID()+"@home-cell.invalid"; }
export function publicLoginEmail(email?: string) {
 return email && !email.toLowerCase().endsWith("@home-cell.invalid") ? email : "";
}
export async function phoneUsernameUser(db: SupabaseClient, phone: string) {
 const {data,error}=await db.from("hco_phone_usernames").select("user_id").eq("phone",phone).maybeSingle();
 if(error)throw Error("PHONE_USERNAME_UNAVAILABLE");
 if(!data)return null;
 const user=await db.auth.admin.getUserById(data.user_id);
 if(user.error || !user.data.user)throw Error("PHONE_USERNAME_UNAVAILABLE");
 return user.data.user;
}
