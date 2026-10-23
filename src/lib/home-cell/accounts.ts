import type { SupabaseClient, User } from "@supabase/supabase-js";
/** Exact email match only. Never alter an existing account's password or metadata. */
export async function findAccountByEmail(
  db: SupabaseClient,
  email: string,
): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw Error("ACCOUNT_LOOKUP_UNAVAILABLE");
    const found = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  throw Error("ACCOUNT_LOOKUP_LIMIT_REACHED");
}

export async function findAccountByIdentity(db: SupabaseClient, identity: {email?: string; phone?: string}): Promise<User | null> {
  let match: User | null = null;
  if (identity.phone) {
    const {data,error}=await db.from("hco_phone_usernames").select("user_id").eq("phone",identity.phone).maybeSingle();
    if(error)throw Error("Apply migration 013 before creating phone usernames.");
    if(data){
      const found=await db.auth.admin.getUserById(data.user_id);
      if(found.error || !found.data.user)throw Error("ACCOUNT_LOOKUP_UNAVAILABLE");
      match=found.data.user;
    }
  }
  for (let page = 1; page <= 100; page++) {
    const {data, error} = await db.auth.admin.listUsers({page, perPage: 200});
    if (error) throw Error("ACCOUNT_LOOKUP_UNAVAILABLE");
    for (const u of data.users) {
      if ((identity.email && u.email?.toLowerCase() === identity.email) ||
          (identity.phone && u.phone && "+" + u.phone.replace(/\D/g, "") === identity.phone)) {
        if (match && match.id !== u.id) throw Error("Email and phone belong to different accounts. Use one identifier.");
        match = u;
      }
    }
    if (data.users.length < 200) return match;
  }
  throw Error("ACCOUNT_LOOKUP_LIMIT_REACHED");
}
