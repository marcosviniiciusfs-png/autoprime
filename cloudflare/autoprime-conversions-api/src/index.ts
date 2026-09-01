type ConversionPayload = {
  event_name: "Lead";
  event_id: string;
  event_source_url: string;
  lead_data: Record<string, unknown>;
  user_data?: {
    ph?: string;
    fn?: string;
    ln?: string;
    ct?: string;
    fbp?: string;
    fbc?: string;
  };
  custom_data?: Record<string, unknown>;
};

type MetaResponse = {
  events_received?: number;
  messages?: unknown[];
  fbtrace_id?: string;
  error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPayload = (value: unknown): value is ConversionPayload => {
  if (!isRecord(value) || value.event_name !== "Lead") return false;
  if (typeof value.event_id !== "string" || !/^lead_[a-f0-9-]{36}$/i.test(value.event_id)) return false;
  if (typeof value.event_source_url !== "string" || value.event_source_url.length > 2048) return false;
  return isRecord(value.lead_data);
};

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });

const normalize = (value = "") =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

const normalizePhone = (value = "") => {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const allowedOrigins = (env: Env) => env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

const metaUserData = async (payload: ConversionPayload, request: Request) => {
  const user = payload.user_data ?? {};
  const result: Record<string, string | string[]> = {
    client_ip_address: request.headers.get("CF-Connecting-IP") ?? "",
    client_user_agent: request.headers.get("User-Agent") ?? "",
  };
  if (user.ph) result.ph = [await sha256(normalizePhone(user.ph))];
  if (user.fn) result.fn = [await sha256(normalize(user.fn))];
  if (user.ln) result.ln = [await sha256(normalize(user.ln))];
  if (user.ct) result.ct = [await sha256(normalize(user.ct))];
  if (user.fbp) result.fbp = user.fbp;
  if (user.fbc) result.fbc = user.fbc;
  return result;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "autoprime-conversions-api" });
    }
    if (url.pathname !== "/events") return json({ success: false, error: "Not found" }, 404);

    const origin = request.headers.get("Origin") ?? "";
    if (!allowedOrigins(env).includes(origin)) return json({ success: false, error: "Origin not allowed" }, 403);
    const cors = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405, cors);

    const contentLength = Number(request.headers.get("Content-Length") ?? 0);
    if (contentLength > 64 * 1024) return json({ success: false, error: "Payload too large" }, 413, cors);

    try {
      const body: unknown = await request.json();
      if (!isPayload(body)) return json({ success: false, error: "Invalid event payload" }, 400, cors);

      const sourceOrigin = new URL(body.event_source_url).origin;
      if (!allowedOrigins(env).includes(sourceOrigin)) {
        return json({ success: false, error: "Invalid event source" }, 400, cors);
      }

      const response = await fetch(
        `https://graph.facebook.com/${encodeURIComponent(env.META_GRAPH_API_VERSION)}/${encodeURIComponent(env.META_PIXEL_ID)}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: [{
              event_name: body.event_name,
              event_time: Math.floor(Date.now() / 1000),
              event_id: body.event_id,
              event_source_url: body.event_source_url,
              action_source: "website",
              user_data: await metaUserData(body, request),
              custom_data: body.custom_data ?? {},
            }],
            access_token: env.META_CAPI_ACCESS_TOKEN,
          }),
        },
      );

      const meta = await response.json<MetaResponse>().catch(() => ({}));
      const success = response.ok && (meta.events_received ?? 0) > 0;
      console.log(JSON.stringify({
        message: "conversion processed",
        event_id: body.event_id,
        success,
        meta_status: response.status,
        events_received: meta.events_received ?? 0,
        fbtrace_id: meta.fbtrace_id ?? meta.error?.fbtrace_id ?? null,
        error_code: meta.error?.code ?? null,
      }));

      return json({
        success,
        meta: {
          success,
          status: response.status,
          events_received: meta.events_received ?? 0,
          messages: meta.messages ?? [],
          error: meta.error ?? null,
          fbtrace_id: meta.fbtrace_id ?? meta.error?.fbtrace_id ?? null,
        },
      }, success ? 200 : 502, cors);
    } catch (error) {
      console.error(JSON.stringify({
        message: "conversion API error",
        error: error instanceof Error ? error.message : "Unknown error",
      }));
      return json({ success: false, error: "Invalid request" }, 400, cors);
    }
  },
} satisfies ExportedHandler<Env>;
