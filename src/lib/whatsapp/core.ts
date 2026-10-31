import { createHmac, timingSafeEqual } from "node:crypto";
export type WaJob = {
  id: string;
  recipient: string;
  name: string;
  body: string;
  template: string;
  language: string;
  templateBody: string;
  flyer: string;
};
export function apiConfig(env: NodeJS.ProcessEnv = process.env) {
  const enabled = env.WHATSAPP_API_ENABLED === "true";
  const version = env.WHATSAPP_GRAPH_VERSION || "",
    phoneId = env.WHATSAPP_PHONE_NUMBER_ID || "",
    wabaId = env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
    token = env.WHATSAPP_ACCESS_TOKEN || "",
    secret = env.WHATSAPP_APP_SECRET || "",
    verify = env.WHATSAPP_VERIFY_TOKEN || "";
  let origin = "";
  try {
    const u = new URL(env.APP_ORIGIN || "");
    if (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      u.pathname === "/" &&
      !u.search &&
      !u.hash &&
      !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        u.hostname,
      ) &&
      !u.hostname.includes(":")
    )
      origin = u.origin;
  } catch {}
  return {
    enabled,
    version,
    phoneId,
    wabaId,
    token,
    secret,
    verify,
    origin,
    ready:
      enabled &&
      /^v\d+\.\d+$/.test(version) &&
      /^\d+$/.test(phoneId) &&
      /^\d+$/.test(wabaId) &&
      !!token &&
      secret.length >= 16 &&
      verify.length >= 16 &&
      !!origin,
  };
}
export function signatureOK(
  raw: Uint8Array,
  header: string | null,
  secret: string,
) {
  if (!secret || !header || !/^sha256=[a-fA-F0-9]{64}$/.test(header))
    return false;
  return timingSafeEqual(
    Buffer.from(header.slice(7), "hex"),
    createHmac("sha256", secret).update(raw).digest(),
  );
}
export function templatePayload(job: WaJob, origin: string) {
  if (job.flyer !== "/whatsapp/sunday-invitation.jpg")
    throw Error("Unknown flyer.");
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: job.recipient.replace(/\D/g, ""),
    type: "template",
    biz_opaque_callback_data: job.id,
    template: {
      name: job.template,
      language: { code: job.language },
      components: [
        {
          type: "header",
          parameters: [{ type: "image", image: { link: origin + job.flyer } }],
        },
        ...(job.templateBody.includes("{{1}}")
          ? [{ type: "body", parameters: [{ type: "text", text: job.name }] }]
          : []),
      ],
    },
  };
}
export function approvedTemplate(value: unknown, job: WaJob) {
  const data = (
    value as {
      data?: {
        name?: string;
        language?: string;
        status?: string;
        parameter_format?: string;
        components?: { type: string; format?: string; text?: string }[];
      }[];
    }
  )?.data;
  const t = data?.find(
    (x) =>
      x.name === job.template &&
      x.language === job.language &&
      x.status === "APPROVED",
  );
  if (!t || t.parameter_format === "NAMED") return false;
  const components = t.components || [],
    header = components.find((x) => x.type === "HEADER"),
    body = components.find((x) => x.type === "BODY");
  return (
    header?.format === "IMAGE" &&
    body?.text?.replace(/\r\n/g, "\n") ===
      job.templateBody.replace(/\r\n/g, "\n") &&
    !components.some((x) => !["HEADER", "BODY", "FOOTER"].includes(x.type))
  );
}
export function webhookEvents(data: unknown, phoneId: string, wabaId: string) {
  const statuses: Record<string, string>[] = [];
  const replies: Record<string, string>[] = [];
  const root = data as {
    object?: string;
    entry?: {
      id?: string;
      changes?: {
        field?: string;
        value?: {
          metadata?: { phone_number_id?: string };
          statuses?: {
            id?: string;
            status?: string;
            recipient_id?: string;
            timestamp?: string;
            biz_opaque_callback_data?: string;
            errors?: { code?: number }[];
          }[];
          messages?: {
            id?: string;
            from?: string;
            timestamp?: string;
            type?: string;
            text?: { body?: string };
            button?: { text?: string };
          }[];
        };
      }[];
    }[];
  };
  if (root?.object !== "whatsapp_business_account")
    return { statuses, replies };
  for (const e of root.entry || []) {
    if (e.id !== wabaId) continue;
    for (const c of e.changes || []) {
      const v = c.value;
      if (c.field !== "messages" || v?.metadata?.phone_number_id !== phoneId)
        continue;
      for (const s of v.statuses || []) {
        if (
          s.id &&
          s.id.length < 250 &&
          ["sent", "delivered", "read", "failed"].includes(s.status || "") &&
          /^\d{7,15}$/.test(s.recipient_id || "") &&
          /^\d{1,12}$/.test(s.timestamp || "")
        )
          statuses.push({
            id: s.id,
            status: s.status!,
            recipient: s.recipient_id!,
            timestamp: s.timestamp!,
            callback: s.biz_opaque_callback_data || "",
            error: String(s.errors?.[0]?.code || ""),
          });
      }
      for (const m of v.messages || []) {
        if (
          m.id &&
          m.id.length < 250 &&
          /^\d{7,15}$/.test(m.from || "") &&
          /^\d{1,12}$/.test(m.timestamp || "")
        )
          replies.push({
            id: m.id,
            from: m.from!,
            timestamp: m.timestamp!,
            body: (
              m.text?.body ||
              m.button?.text ||
              "[" + (m.type || "unsupported") + " message]"
            ).slice(0, 4000),
          });
      }
    }
  }
  if (statuses.length > 500 || replies.length > 500)
    throw Error("Event batch too large.");
  return { statuses, replies };
}
export async function deliverWithMeta(
  job: WaJob,
  config: ReturnType<typeof apiConfig>,
  transport: typeof fetch,
  authorize: () => Promise<boolean>,
) {
  let attempted = false;
  const result = {
    state: "failed",
    provider: null as string | null,
    code: "template_not_approved_or_mismatch" as string | null,
  };
  if (!config.ready) return { ...result, code: "api_not_configured" };
  try {
    const base = "https://graph.facebook.com/" + config.version;
    const check = await transport(
      base +
        "/" +
        config.wabaId +
        "/message_templates?" +
        new URLSearchParams({
          name: job.template,
          fields: "name,language,status,components,parameter_format",
          limit: "100",
        }),
      {
        headers: { Authorization: "Bearer " + config.token },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      },
    );
    if (!check.ok) return { ...result, code: "template_check_" + check.status };
    if (!approvedTemplate(await check.json(), job)) return result;
    if (!(await authorize()))
      return { ...result, code: "permission_or_identity_changed" };
    attempted = true;
    const response = await transport(
      base + "/" + config.phoneId + "/messages",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + config.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(templatePayload(job, config.origin)),
        signal: AbortSignal.timeout(20000),
        redirect: "error",
      },
    );
    const x = await response.json();
    if (response.ok && typeof x.messages?.[0]?.id === "string")
      return {
        state: "accepted",
        provider: x.messages[0].id as string,
        code: null,
      };
    if (response.ok || response.status >= 500)
      return {
        ...result,
        state: "unknown",
        code: "provider_result_uncertain_" + response.status,
      };
    return {
      ...result,
      code: "provider_" + String(x.error?.code || response.status),
    };
  } catch {
    return {
      ...result,
      state: attempted ? "unknown" : "failed",
      code: attempted
        ? "delivery_result_uncertain"
        : "template_check_unavailable",
    };
  }
}
