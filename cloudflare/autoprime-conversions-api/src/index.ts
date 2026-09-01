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

type DestinationResult = {
  success: boolean;
  status: number;
  error?: string;
};

const GITHUB_API_VERSION = "2022-11-28";

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

const bytesToBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const slugify = (value: unknown) =>
  String(value ?? "lead")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "lead";

const configuredWebhooks = (env: Env) => {
  const raw = env.LEAD_DESTINATION_WEBHOOK_URLS?.trim();
  if (!raw) return [];
  return raw.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean);
};

const sendWebhook = async (url: string, payload: ConversionPayload): Promise<DestinationResult> => {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload.lead_data,
        event_name: payload.event_name,
        event_id: payload.event_id,
        source_url: payload.event_source_url,
      }),
    });
    return {
      success: response.ok,
      status: response.status,
      error: response.ok ? undefined : `Webhook HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      error: error instanceof Error ? error.message : "Webhook request failed",
    };
  }
};

const archiveLead = async (
  payload: ConversionPayload,
  request: Request,
  env: Env,
  destinations: { meta: DestinationResult; webhooks: DestinationResult[] },
) => {
  const archivedAt = new Date().toISOString();
  const timestamp = archivedAt.replace(/[:.]/g, "-");
  const date = archivedAt.slice(0, 10);
  const name = slugify(payload.lead_data.nome);
  const directory = env.GITHUB_LEADS_DIR.replace(/^\/+|\/+$/g, "");
  const path = `${directory}/${date}/${timestamp}-${payload.event_id}-${name}.json`;
  const record = {
    archive_version: 1,
    archived_at: archivedAt,
    event_name: payload.event_name,
    event_id: payload.event_id,
    destination_results: destinations,
    lead: payload.lead_data,
    request: {
      source_url: payload.event_source_url,
      user_agent: request.headers.get("User-Agent"),
      client_ip_address: request.headers.get("CF-Connecting-IP"),
    },
  };
  const apiPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_LEADS_OWNER)}/${encodeURIComponent(env.GITHUB_LEADS_REPO)}/contents/${apiPath}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_LEADS_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "autoprime-lead-worker",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
    body: JSON.stringify({
      message: `Registra lead Auto Prime ${String(payload.lead_data.nome ?? payload.event_id)}`,
      content: bytesToBase64(JSON.stringify(record, null, 2)),
      branch: env.GITHUB_LEADS_BRANCH,
    }),
  });

  const body = await response.json<{ content?: { html_url?: string }; commit?: { sha?: string }; message?: string }>().catch(() => ({}));
  return {
    success: response.ok,
    status: response.status,
    path,
    html_url: body.content?.html_url,
    commit_sha: body.commit?.sha,
    error: response.ok ? undefined : body.message ?? `GitHub HTTP ${response.status}`,
  };
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

      const metaRequest = fetch(
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

      const webhookUrls = configuredWebhooks(env);
      const [response, webhookResults] = await Promise.all([
        metaRequest,
        Promise.all(webhookUrls.map((webhookUrl) => sendWebhook(webhookUrl, body))),
      ]);

      const meta = await response.json<MetaResponse>().catch(() => ({}));
      const metaSuccess = response.ok && (meta.events_received ?? 0) > 0;
      const metaResult: DestinationResult = {
        success: metaSuccess,
        status: response.status,
        error: metaSuccess ? undefined : meta.error?.message ?? `Meta HTTP ${response.status}`,
      };
      const archive = await archiveLead(body, request, env, { meta: metaResult, webhooks: webhookResults });
      const webhooksSuccess = webhookResults.every((result) => result.success);
      const success = metaSuccess && webhooksSuccess && archive.success;
      console.log(JSON.stringify({
        message: "conversion processed",
        event_id: body.event_id,
        success,
        meta_status: response.status,
        events_received: meta.events_received ?? 0,
        webhook_count: webhookResults.length,
        webhooks_success: webhooksSuccess,
        archive_success: archive.success,
        archive_status: archive.status,
        archive_path: archive.path,
        fbtrace_id: meta.fbtrace_id ?? meta.error?.fbtrace_id ?? null,
        error_code: meta.error?.code ?? null,
      }));

      return json({
        success,
        meta: {
          success: metaSuccess,
          status: response.status,
          events_received: meta.events_received ?? 0,
          messages: meta.messages ?? [],
          error: meta.error ?? null,
          fbtrace_id: meta.fbtrace_id ?? meta.error?.fbtrace_id ?? null,
        },
        webhooks: webhookResults,
        archive,
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
