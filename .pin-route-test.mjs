const {authJSON,hasSameOrigin,readJson,PayloadError,adminDb,authRateLimit,loginIdentity,createClient,checkPin,validPin}=globalThis.__route;







export const dynamic = "force-dynamic";
export async function POST(req) {
    if (!hasSameOrigin(req))
        return authJSON({ message: "Invalid origin." }, 403);
    try {
        const limit = await authRateLimit(req, "login");
        if (limit)
            return limit;
        const b = await readJson(req, 2048);
        const identity = typeof b.identifier === "string" && b.identifier.length <= 254
            ? loginIdentity(b.identifier)
            : null;
        if (!identity || !validPin(b.pin))
            return authJSON({
                message: "Enter an email or phone number and exactly four PIN digits.",
            }, 400);
        const secret = process.env.FRIEND_PIN_SECRET;
        if (!secret || secret.length < 32)
            return authJSON({ message: "Friend sign-in is not configured." }, 503);
        const db = adminDb();
        const a = await db.rpc("care_friend_pin_attempt", {
            p_identity: identity.email || identity.phone,
        });
        if (a.error)
            throw Error("PROTECTION_UNAVAILABLE");
        const r = a.data;
        const accepted = await checkPin(b.pin, r?.pin_hash || "0".repeat(32) + ":" + "0".repeat(128), secret);
        if (!accepted || !r?.user_id)
            return authJSON({
                message: "Unable to sign in. Check your details or ask the administrator to reset your PIN if attempts are locked.",
            }, 401);
        const allowed = await db.rpc("care_friend_pin_complete", {
            p_user: r.user_id,
            p_version: r.version,
        });
        if (allowed.error || allowed.data !== true)
            return authJSON({
                message: "Unable to sign in. Ask the administrator to check your Friend access.",
            }, 401);
        const user = await db.auth.admin.getUserById(r.user_id);
        if (user.error || !user.data.user?.email)
            throw Error("ACCOUNT_UNAVAILABLE");
        // Generate a server-only one-time token after successful PIN verification. No email is sent.
        const link = await db.auth.admin.generateLink({
            type: "magiclink",
            email: user.data.user.email,
        });
        if (link.error || !link.data.properties?.hashed_token)
            throw Error("SESSION_UNAVAILABLE");
        const client = await createClient();
        const signed = await client.auth.verifyOtp({
            type: "magiclink",
            token_hash: link.data.properties.hashed_token,
        });
        if (signed.error || signed.data.user?.id !== r.user_id) {
            await client.auth.signOut({ scope: "local" });
            throw Error("SESSION_UNAVAILABLE");
        }
        return authJSON({ next: "/followups" });
    }
    catch (e) {
        return authJSON({
            message: e instanceof PayloadError
                ? e.message
                : "Friend sign-in is temporarily unavailable.",
        }, e instanceof PayloadError ? e.status : 503);
    }
}
